use crate::ipc::EngineConnection;
use serde_json::json;
use std::path::PathBuf;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::sleep;

/// Start the Tide Engine sidecar and return a connected EngineConnection + child handle.
/// The child handle must be kept alive to prevent kill_on_drop from killing the engine.
pub async fn start_engine() -> Result<(EngineConnection, tokio::process::Child), Box<dyn std::error::Error + Send + Sync>> {
    let pid = std::process::id();
    let socket_path = format!("/tmp/tide-engine-{}.sock", pid);

    // Clean stale socket
    let _ = std::fs::remove_file(&socket_path);

    // Resolve engine entry point
    let engine_path = resolve_engine_path()?;
    tracing::info!("Starting engine: {} --socket {}", engine_path.display(), socket_path);

    // Spawn engine process
    let mut child = Command::new("node")
        .arg(&engine_path)
        .arg("--socket")
        .arg(&socket_path)
        .kill_on_drop(true)
        .spawn()?;

    // Connect with retry (handles both file-not-yet-created and listen-not-yet-ready races)
    let conn = match connect_with_retry(&socket_path, Duration::from_secs(5)).await {
        Some(c) => c,
        None => {
            child.kill().await.ok();
            return Err("Engine not ready after 5s".into());
        }
    };

    // Perform handshake
    let handshake = json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "type": "handshake",
        "timestamp": chrono_timestamp(),
        "version": "0.1.0",
        "clientId": format!("tauri-{}", pid),
    });
    conn.send(&handshake).await?;

    // Wait for handshake_ack via fallback channel
    let mut fallback = conn.fallback_rx.lock().await;
    match tokio::time::timeout(Duration::from_secs(5), fallback.recv()).await {
        Ok(Some(ack)) => {
            if ack.get("type").and_then(|t: &serde_json::Value| t.as_str()) == Some("handshake_ack") {
                let engine_id = ack.get("engineId").and_then(|e: &serde_json::Value| e.as_str()).unwrap_or("unknown");
                tracing::info!("Engine handshake OK, engineId={}", engine_id);
            } else {
                return Err(format!("Unexpected handshake response: {:?}", ack).into());
            }
        }
        Ok(None) => return Err("Engine connection dropped during handshake".into()),
        Err(_) => return Err("Handshake timed out".into()),
    }
    drop(fallback);

    Ok((conn, child))
}

fn resolve_engine_path() -> Result<PathBuf, Box<dyn std::error::Error + Send + Sync>> {
    // Check env var first
    if let Ok(path) = std::env::var("TIDE_ENGINE_PATH") {
        let p = PathBuf::from(path);
        if p.exists() {
            return Ok(p);
        }
    }

    // Try relative path from the Tauri app
    let candidates = [
        // Development: from project root
        "../../apps/engine/dist/main.js",
        // From Tauri src dir
        "../../../apps/engine/dist/main.js",
        // Absolute fallback
        "apps/engine/dist/main.js",
    ];

    for candidate in &candidates {
        let p = PathBuf::from(candidate);
        if p.exists() {
            return Ok(p.canonicalize()?);
        }
    }

    // Try from current working directory
    let cwd = std::env::current_dir()?;
    let from_cwd = cwd.join("apps/engine/dist/main.js");
    if from_cwd.exists() {
        return Ok(from_cwd);
    }

    Err("Could not find engine entry point (apps/engine/dist/main.js). Set TIDE_ENGINE_PATH env var.".into())
}

async fn connect_with_retry(socket_path: &str, timeout: Duration) -> Option<EngineConnection> {
    let start = std::time::Instant::now();
    let mut delay = Duration::from_millis(50);

    while start.elapsed() < timeout {
        match EngineConnection::connect(socket_path).await {
            Ok(conn) => return Some(conn),
            Err(_) => {
                sleep(delay).await;
                delay = (delay * 2).min(Duration::from_millis(500));
            }
        }
    }
    None
}

fn chrono_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
