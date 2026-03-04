use crate::ipc::PiConnection;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

/// Start the Pi agent in RPC mode and return a PiConnection + child handle.
pub async fn start_pi(
    workspace_root: &str,
    extensions: &[String],
) -> Result<(PiConnection, Child), Box<dyn std::error::Error + Send + Sync>> {
    let pi_path = resolve_pi_path()?;
    tracing::info!("Starting Pi: {} --mode rpc (cwd: {})", pi_path, workspace_root);

    let mut cmd = Command::new(&pi_path);
    cmd.arg("--mode").arg("rpc");
    cmd.arg("--no-session"); // Tide manages its own session concept

    for ext in extensions {
        cmd.arg("-e").arg(ext);
    }

    cmd.current_dir(workspace_root);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.kill_on_drop(true);

    let mut child = cmd.spawn()?;

    let stdin = child.stdin.take().ok_or("Failed to capture Pi stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to capture Pi stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture Pi stderr")?;

    // Log Pi's stderr in the background
    let stderr_reader = BufReader::new(stderr);
    tokio::spawn(async move {
        let mut lines = stderr_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            tracing::debug!("[pi:stderr] {}", line);
        }
    });

    let conn = PiConnection::new(stdin, stdout);

    tracing::info!("Pi agent process started (pid: {:?})", child.id());
    Ok((conn, child))
}

fn resolve_pi_path() -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    // 1. Check env var
    if let Ok(p) = std::env::var("TIDE_PI_PATH") {
        if PathBuf::from(&p).exists() {
            return Ok(p);
        }
    }

    // 2. Check node_modules/.bin/pi relative to project root
    let candidates = [
        "node_modules/.bin/pi",
        "../../node_modules/.bin/pi",       // from src-tauri/
        "../../../node_modules/.bin/pi",     // from src-tauri/src/
    ];
    for candidate in &candidates {
        let p = PathBuf::from(candidate);
        if p.exists() {
            return Ok(p.canonicalize()?.to_string_lossy().to_string());
        }
    }

    // 3. Check from CWD
    let cwd = std::env::current_dir()?;
    let from_cwd = cwd.join("node_modules/.bin/pi");
    if from_cwd.exists() {
        return Ok(from_cwd.to_string_lossy().to_string());
    }

    // 4. Assume it's on PATH
    Ok("pi".to_string())
}
