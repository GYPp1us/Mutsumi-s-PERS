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
    if name.trim().is_empty() { return Err("Group name cannot be empty".into()); }
    if color.trim().is_empty() { return Err("Group color cannot be empty".into()); }
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    if store.groups.iter().any(|g| g.name == name) {
        return Err(format!("Group \"{}\" already exists", name));
    }
    let group = GroupMeta {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        color,
        collapsed: false,
    };
    store.groups.push(group.clone());
    if let Err(e) = store.save() {
        store.groups.pop();
        return Err(e);
    }
    Ok(group)
}

#[tauri::command]
pub fn delete_group(state: State<AppState>, id: String) -> Result<(), String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    let prev_groups = store.groups.clone();
    let prev_project_states: Vec<_> = store.projects.iter()
        .filter(|p| p.group_id.as_deref() == Some(&id))
        .map(|p| (p.id.clone(), p.group_id.clone()))
        .collect();
    store.groups.retain(|g| g.id != id);
    for p in &mut store.projects {
        if p.group_id.as_deref() == Some(&id) {
            p.group_id = None;
        }
    }
    if let Err(e) = store.save() {
        store.groups = prev_groups;
        for p in &mut store.projects {
            if let Some((_, gid)) = prev_project_states.iter().find(|(pid, _)| pid == &p.id) {
                p.group_id = gid.clone();
            }
        }
        return Err(e);
    }
    Ok(())
}

#[tauri::command]
pub fn rename_group(state: State<AppState>, id: String, name: String) -> Result<(), String> {
    if name.trim().is_empty() { return Err("Group name cannot be empty".into()); }
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    let idx = store.groups.iter().position(|g| g.id == id).ok_or("Group not found")?;
    let prev = store.groups[idx].name.clone();
    store.groups[idx].name = name;
    if let Err(e) = store.save() {
        store.groups[idx].name = prev;
        return Err(e);
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_group(state: State<AppState>, id: String, collapsed: bool) -> Result<(), String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    let idx = store.groups.iter().position(|g| g.id == id).ok_or("Group not found")?;
    let prev = store.groups[idx].collapsed;
    store.groups[idx].collapsed = collapsed;
    if let Err(e) = store.save() {
        store.groups[idx].collapsed = prev;
        return Err(e);
    }
    Ok(())
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

    let pidx = store.projects.iter().position(|p| p.id == project_id)
        .ok_or("Project not found")?;
    let prev = store.projects[pidx].group_id.clone();
    store.projects[pidx].group_id = group_id;
    if let Err(e) = store.save() {
        store.projects[pidx].group_id = prev;
        return Err(e);
    }
    Ok(())
}
