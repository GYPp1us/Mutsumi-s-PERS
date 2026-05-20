use tauri::State;
use crate::store::Settings;
use crate::AppState;

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<Settings, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    Ok(store.settings.clone())
}

#[tauri::command]
pub fn update_settings(state: State<AppState>, settings: Settings) -> Result<(), String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    store.settings = settings;
    store.save()
}
