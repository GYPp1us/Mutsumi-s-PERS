use std::process::Command;
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[tauri::command]
pub async fn git_status(project_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-C", &project_path, "status", "--porcelain", "-b"])
        .output()
        .map_err(|e| format!("git not found: {}", e))?;
    String::from_utf8(output.stdout).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_pull(project_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-C", &project_path, "pull"])
        .output()
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if output.status.success() { Ok(stdout) } else { Err(stderr) }
}

#[tauri::command]
pub async fn git_push(project_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-C", &project_path, "push"])
        .output()
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if output.status.success() { Ok(stdout) } else { Err(stderr) }
}

#[tauri::command]
pub async fn git_fetch(project_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-C", &project_path, "fetch", "--all"])
        .output()
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if output.status.success() { Ok(stdout) } else { Err(stderr) }
}
