use tauri::State;
use std::process::Command;
use crate::AppState;

#[tauri::command]
pub async fn launch_editor(state: State<'_, AppState>, editor_id: String, project_path: String) -> Result<(), String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let editor = store.settings.editors.iter()
        .find(|e| e.id == editor_id)
        .ok_or("Editor not found")?;

    let args: Vec<String> = editor.args.iter()
        .map(|a| a.replace("{path}", &project_path))
        .collect();

    Command::new(&editor.path)
        .args(&args)
        .spawn()
        .map_err(|e| format!("Failed to launch {}: {}", editor.name, e))?;

    Ok(())
}
