use tauri::State;
use crate::store::GroupMeta;
use crate::AppState;

#[tauri::command]
pub fn list_groups(state: State<AppState>) -> Result<Vec<GroupMeta>, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    Ok(store.groups.clone())
}

#[tauri::command]
pub fn create_group(
    state: State<AppState>,
    name: String,
    color: String,
) -> Result<GroupMeta, String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    let group = GroupMeta {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        color,
        collapsed: false,
    };
    store.groups.push(group.clone());
    store.save()?;
    Ok(group)
}

#[tauri::command]
pub fn delete_group(state: State<AppState>, id: String) -> Result<(), String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    store.groups.retain(|g| g.id != id);
    for p in &mut store.projects {
        if p.group_id.as_deref() == Some(&id) {
            p.group_id = None;
        }
    }
    store.save()
}

#[tauri::command]
pub fn rename_group(state: State<AppState>, id: String, name: String) -> Result<(), String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    let group = store.groups.iter_mut().find(|g| g.id == id)
        .ok_or("Group not found")?;
    group.name = name;
    store.save()
}

#[tauri::command]
pub fn toggle_group(state: State<AppState>, id: String, collapsed: bool) -> Result<(), String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    let group = store.groups.iter_mut().find(|g| g.id == id)
        .ok_or("Group not found")?;
    group.collapsed = collapsed;
    store.save()
}

#[tauri::command]
pub fn set_project_group(
    state: State<AppState>,
    project_id: String,
    group_id: Option<String>,
) -> Result<(), String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;

    if let Some(ref gid) = group_id {
        if !store.groups.iter().any(|g| &g.id == gid) {
            return Err("Group not found".into());
        }
    }

    let project = store.projects.iter_mut().find(|p| p.id == project_id)
        .ok_or("Project not found")?;
    project.group_id = group_id;
    store.save()
}
