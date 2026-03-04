use bytes::{Buf, BufMut, BytesMut};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::UnixStream;
use tokio::sync::{mpsc, Mutex};

/// A framed connection to the Tide Engine over UDS.
/// Wire format: [4-byte big-endian u32 length][UTF-8 JSON payload]
///
/// Supports request-response correlation: callers register a `requestId`
/// and get all messages for that request via an mpsc channel.
pub struct EngineConnection {
    writer: Arc<Mutex<tokio::io::WriteHalf<UnixStream>>>,
    /// Pending request channels keyed by requestId.
    /// For streaming requests, multiple messages arrive per request.
    pending: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<Value>>>>,
    /// Fallback channel for uncorrelated messages (handshake, etc.)
    pub fallback_rx: Arc<Mutex<mpsc::Receiver<Value>>>,
}

impl EngineConnection {
    /// Connect to the engine UDS and start the read loop.
    pub async fn connect(
        socket_path: &str,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let stream = UnixStream::connect(socket_path).await?;
        let (read_half, write_half) = tokio::io::split(stream);
        let writer = Arc::new(Mutex::new(write_half));

        let pending: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<Value>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let (fallback_tx, fallback_rx) = mpsc::channel::<Value>(64);

        // Spawn read loop
        let pending_clone = pending.clone();
        tokio::spawn(async move {
            if let Err(e) = read_loop(read_half, pending_clone, fallback_tx).await {
                tracing::error!("Engine read loop error: {}", e);
            }
        });

        Ok(Self {
            writer,
            pending,
            fallback_rx: Arc::new(Mutex::new(fallback_rx)),
        })
    }

    /// Send a JSON message to the engine with length-prefix framing.
    pub async fn send(
        &self,
        msg: &Value,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let json = serde_json::to_string(msg)?;
        let payload = json.as_bytes();
        let len = payload.len() as u32;

        let mut buf = BytesMut::with_capacity(4 + payload.len());
        buf.put_u32(len);
        buf.put_slice(payload);

        let mut writer = self.writer.lock().await;
        writer.write_all(&buf).await?;
        writer.flush().await?;
        Ok(())
    }

    /// Register a request and return a receiver for all messages with that requestId.
    pub async fn register_request(
        &self,
        request_id: &str,
    ) -> mpsc::UnboundedReceiver<Value> {
        let (tx, rx) = mpsc::unbounded_channel();
        self.pending.lock().await.insert(request_id.to_string(), tx);
        rx
    }

    /// Unregister a pending request (cleanup).
    pub async fn unregister_request(&self, request_id: &str) {
        self.pending.lock().await.remove(request_id);
    }

    /// Send a tool_request and wait for a single tool_response.
    pub async fn request_response(
        &self,
        request_id: &str,
        msg: &Value,
    ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        tracing::debug!("request_response: registering {}", request_id);
        let mut rx = self.register_request(request_id).await;
        tracing::debug!("request_response: sending message");
        self.send(msg).await?;
        tracing::debug!("request_response: waiting for response (30s timeout)");

        let result = tokio::time::timeout(std::time::Duration::from_secs(30), rx.recv())
            .await
            .map_err(|_| {
                tracing::error!("request_response: TIMED OUT for {}", request_id);
                "Request timed out"
            })?
            .ok_or_else(|| {
                tracing::error!("request_response: channel closed for {}", request_id);
                "Engine connection lost"
            })?;

        tracing::debug!("request_response: got response for {}", request_id);
        self.unregister_request(request_id).await;
        Ok(result)
    }
}

/// Extract a requestId from a message (checks requestId, then streamId-based lookup).
fn extract_request_key(msg: &Value) -> Option<String> {
    // tool_response, stream_start have requestId directly
    if let Some(id) = msg.get("requestId").and_then(|v| v.as_str()) {
        return Some(id.to_string());
    }
    // stream_delta, stream_end have streamId — we use streamId as correlation key too
    if let Some(id) = msg.get("streamId").and_then(|v| v.as_str()) {
        return Some(id.to_string());
    }
    None
}

async fn read_loop(
    mut reader: tokio::io::ReadHalf<UnixStream>,
    pending: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<Value>>>>,
    fallback_tx: mpsc::Sender<Value>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut buf = BytesMut::new();

    loop {
        let mut tmp = vec![0u8; 4096];
        let n = reader.read(&mut tmp).await?;
        if n == 0 {
            tracing::info!("Engine connection closed");
            break;
        }
        buf.extend_from_slice(&tmp[..n]);

        // Drain complete frames
        while buf.len() >= 4 {
            let len = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]) as usize;
            if buf.len() < 4 + len {
                break;
            }
            buf.advance(4);
            let payload = buf.split_to(len);
            let json_str = std::str::from_utf8(&payload)?;
            match serde_json::from_str::<Value>(json_str) {
                Ok(val) => {
                    let msg_type = val.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    tracing::debug!("read_loop: received message type={}", msg_type);

                    // For stream_start: auto-register streamId → same sender as requestId
                    if msg_type == "stream_start" {
                        if let (Some(req_id), Some(stream_id)) = (
                            val.get("requestId").and_then(|v| v.as_str()),
                            val.get("streamId").and_then(|v| v.as_str()),
                        ) {
                            let pending_guard = pending.lock().await;
                            if let Some(tx) = pending_guard.get(req_id) {
                                let cloned_tx = tx.clone();
                                drop(pending_guard);
                                pending.lock().await.insert(stream_id.to_string(), cloned_tx);
                            }
                        }
                    }

                    // Try to route to a pending request
                    let key = extract_request_key(&val);
                    let mut sent = false;

                    if let Some(ref k) = key {
                        let pending_guard = pending.lock().await;
                        if let Some(tx) = pending_guard.get(k) {
                            if tx.send(val.clone()).is_ok() {
                                tracing::debug!("read_loop: routed to pending key={}", k);
                                sent = true;
                            } else {
                                tracing::warn!("read_loop: send failed for key={}", k);
                            }
                        } else {
                            tracing::warn!("read_loop: no pending request for key={}", k);
                        }
                    } else {
                        tracing::debug!("read_loop: no requestId/streamId in message");
                    }

                    // Clean up streamId registration on stream_end
                    if msg_type == "stream_end" {
                        if let Some(stream_id) = val.get("streamId").and_then(|v| v.as_str()) {
                            pending.lock().await.remove(stream_id);
                        }
                    }

                    if !sent {
                        if fallback_tx.send(val).await.is_err() {
                            tracing::warn!("Fallback receiver dropped");
                            return Ok(());
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to parse engine message: {}", e);
                }
            }
        }
    }
    Ok(())
}
