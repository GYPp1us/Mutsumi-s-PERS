use tauri::State;
use std::process::Command;
use std::os::windows::process::CommandExt;
use crate::AppState;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[tauri::command]
pub async fn launch_editor(state: State<'_, AppState>, editor_id: String, project_path: String) -> Result<(), String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let editor = store.settings.editors.iter()
        .find(|e| e.id == editor_id)
        .ok_or("Editor not found")?;

    let args: Vec<String> = editor.args.iter()
        .map(|a| a.replace("{path}", &project_path))
        .collect();

    Command::new("cmd")
        .args(["/c", "start", "", &editor.path])
        .args(&args)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to launch {}: {}", editor.name, e))?;

    Ok(())
}
