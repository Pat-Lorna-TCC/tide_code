mod ipc;
mod sidecar;
mod stream;

use ipc::EngineConnection;
use stream::StreamEvent;
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::Manager;
use tokio::sync::Mutex;

pub struct AppState {
    pub engine: Arc<Mutex<Option<EngineConnection>>>,
    pub workspace_root: Arc<Mutex<Option<String>>>,
    /// Keep the engine child process alive (kill_on_drop).
    pub _engine_child: Arc<Mutex<Option<tokio::process::Child>>>,
}

#[tauri::command]
async fn send_message(
    state: tauri::State<'_, AppState>,
    message: String,
    on_event: Channel<StreamEvent>,
) -> Result<(), String> {
    let engine_arc = state.engine.clone();
    let engine_guard = engine_arc.lock().await;
    let conn = engine_guard.as_ref().ok_or("Engine not connected")?;

    let request_id = uuid::Uuid::new_v4().to_string();
    let msg = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "type": "tool_request",
        "timestamp": timestamp_ms(),
        "requestId": request_id,
        "tool": "chat",
        "arguments": { "message": message },
    });

    // Register for streaming messages using requestId.
    // The read loop auto-registers streamId when stream_start arrives.
    let mut rx = conn.register_request(&request_id).await;
    conn.send(&msg).await.map_err(|e| e.to_string())?;

    // Drop the lock so other commands can use the connection
    drop(engine_guard);

    // Read stream messages and forward to UI
    loop {
        match tokio::time::timeout(std::time::Duration::from_secs(30), rx.recv()).await {
            Ok(Some(engine_msg)) => {
                let msg_type = engine_msg
                    .get("type")
                    .and_then(|t| t.as_str())
                    .unwrap_or("");

                stream::forward_to_channel(&engine_msg, &on_event);

                if msg_type == "stream_end" {
                    break;
                }
            }
            Ok(None) => {
                return Err("Engine connection lost".to_string());
            }
            Err(_) => {
                return Err("Stream timed out".to_string());
            }
        }
    }

    // Cleanup
    let engine_guard = engine_arc.lock().await;
    if let Some(conn) = engine_guard.as_ref() {
        conn.unregister_request(&request_id).await;
    }

    Ok(())
}

#[tauri::command]
async fn get_engine_status(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let engine = state.engine.lock().await;
    if engine.is_some() {
        Ok("connected".to_string())
    } else {
        Ok("disconnected".to_string())
    }
}

#[tauri::command]
async fn open_workspace(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<serde_json::Value, String> {
    // Store workspace root
    {
        let mut root = state.workspace_root.lock().await;
        *root = Some(path.clone());
    }

    // Fetch initial file listing via engine
    engine_fs_list(&state, &path).await
}

#[tauri::command]
async fn fs_list(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<serde_json::Value, String> {
    engine_fs_list(&state, &path).await
}

#[tauri::command]
async fn fs_read(
    state: tauri::State<'_, AppState>,
    path: String,
    start_line: Option<u32>,
    end_line: Option<u32>,
) -> Result<serde_json::Value, String> {
    let engine_arc = state.engine.clone();
    let engine_guard = engine_arc.lock().await;
    let conn = engine_guard.as_ref().ok_or("Engine not connected")?;

    let request_id = uuid::Uuid::new_v4().to_string();
    let mut args = serde_json::json!({ "path": path });
    if let Some(s) = start_line {
        args["startLine"] = serde_json::json!(s);
    }
    if let Some(e) = end_line {
        args["endLine"] = serde_json::json!(e);
    }

    let msg = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "type": "tool_request",
        "timestamp": timestamp_ms(),
        "requestId": request_id,
        "tool": "fs_read",
        "arguments": args,
    });

    let response = conn
        .request_response(&request_id, &msg)
        .await
        .map_err(|e| e.to_string())?;

    // Drop engine lock
    drop(engine_guard);

    // Check for error in tool_response
    if let Some(err) = response.get("error") {
        return Err(err
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown error")
            .to_string());
    }

    Ok(response.get("result").cloned().unwrap_or(serde_json::Value::Null))
}

/// Internal helper to call fs_list on the engine.
async fn engine_fs_list(
    state: &AppState,
    path: &str,
) -> Result<serde_json::Value, String> {
    tracing::debug!("engine_fs_list called for path: {}", path);

    let engine_arc = state.engine.clone();
    let engine_guard = engine_arc.lock().await;
    let conn = match engine_guard.as_ref() {
        Some(c) => c,
        None => {
            tracing::error!("engine_fs_list: Engine not connected!");
            return Err("Engine not connected".to_string());
        }
    };

    let request_id = uuid::Uuid::new_v4().to_string();
    let msg = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "type": "tool_request",
        "timestamp": timestamp_ms(),
        "requestId": request_id,
        "tool": "fs_list",
        "arguments": { "path": path },
    });

    tracing::debug!("engine_fs_list: sending request {}", request_id);

    let response = match conn.request_response(&request_id, &msg).await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("engine_fs_list: request_response failed: {}", e);
            return Err(e.to_string());
        }
    };

    drop(engine_guard);

    tracing::debug!("engine_fs_list: got response type={}",
        response.get("type").and_then(|t| t.as_str()).unwrap_or("?"));

    if let Some(err) = response.get("error") {
        let msg = err
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown error");
        tracing::error!("engine_fs_list: engine error: {}", msg);
        return Err(msg.to_string());
    }

    let result = response.get("result").cloned().unwrap_or(serde_json::Value::Null);
    tracing::debug!("engine_fs_list: returning {} entries",
        result.as_array().map(|a| a.len()).unwrap_or(0));
    Ok(result)
}

/// Generic helper: send a tool_request and return the result.
async fn engine_tool_request(
    state: &AppState,
    tool: &str,
    arguments: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let engine_arc = state.engine.clone();
    let engine_guard = engine_arc.lock().await;
    let conn = engine_guard.as_ref().ok_or("Engine not connected")?;

    let request_id = uuid::Uuid::new_v4().to_string();
    let msg = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "type": "tool_request",
        "timestamp": timestamp_ms(),
        "requestId": request_id,
        "tool": tool,
        "arguments": arguments,
    });

    let response = conn
        .request_response(&request_id, &msg)
        .await
        .map_err(|e| e.to_string())?;
    drop(engine_guard);

    if let Some(err) = response.get("error") {
        return Err(err
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown error")
            .to_string());
    }
    Ok(response.get("result").cloned().unwrap_or(serde_json::Value::Null))
}

#[tauri::command]
async fn region_tags_list(
    state: tauri::State<'_, AppState>,
    file_path: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut args = serde_json::json!({});
    if let Some(fp) = file_path {
        args["filePath"] = serde_json::json!(fp);
    }
    engine_tool_request(&state, "region_tags.list", args).await
}

#[tauri::command]
async fn region_tags_create(
    state: tauri::State<'_, AppState>,
    tag: serde_json::Value,
) -> Result<serde_json::Value, String> {
    engine_tool_request(&state, "region_tags.create", tag).await
}

#[tauri::command]
async fn region_tags_update(
    state: tauri::State<'_, AppState>,
    id: String,
    updates: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut args = updates;
    args["id"] = serde_json::json!(id);
    engine_tool_request(&state, "region_tags.update", args).await
}

#[tauri::command]
async fn region_tags_delete(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    engine_tool_request(&state, "region_tags.delete", serde_json::json!({ "id": id })).await
}

#[tauri::command]
async fn context_get_breakdown(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    engine_tool_request(&state, "context.get_breakdown", serde_json::json!({})).await
}

#[tauri::command]
async fn context_get_items(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    engine_tool_request(&state, "context.get_items", serde_json::json!({})).await
}

#[tauri::command]
async fn context_toggle_pin(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    engine_tool_request(&state, "context.toggle_pin", serde_json::json!({ "id": id })).await
}

fn timestamp_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "tide_desktop=debug".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init()) // Used by JS-side open() dialog
        .manage(AppState {
            engine: Arc::new(Mutex::new(None)),
            workspace_root: Arc::new(Mutex::new(None)),
            _engine_child: Arc::new(Mutex::new(None)),
        })
        .setup(|app| {
            let engine_state = app.state::<AppState>().inner().engine.clone();
            let child_state = app.state::<AppState>().inner()._engine_child.clone();
            tauri::async_runtime::spawn(async move {
                match sidecar::start_engine().await {
                    Ok((conn, child)) => {
                        tracing::info!("Engine sidecar started successfully");
                        let mut engine = engine_state.lock().await;
                        *engine = Some(conn);
                        let mut child_guard = child_state.lock().await;
                        *child_guard = Some(child);
                    }
                    Err(e) => {
                        tracing::error!("Failed to start engine sidecar: {}", e);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_message,
            get_engine_status,
            open_workspace,
            fs_list,
            fs_read,
            region_tags_list,
            region_tags_create,
            region_tags_update,
            region_tags_delete,
            context_get_breakdown,
            context_get_items,
            context_toggle_pin,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tide");
}
