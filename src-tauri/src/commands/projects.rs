use tauri::State;
use crate::store::{Project, Activity};
use crate::AppState;

#[tauri::command]
pub fn list_projects(state: State<AppState>) -> Result<Vec<Project>, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    Ok(store.projects.clone())
}

#[tauri::command]
pub fn add_project(state: State<AppState>, name: String, path: String) -> Result<Project, String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        path,
        editors: vec![],
        starred: false,
        tags: vec![],
        last_opened: chrono::Utc::now().to_rfc3339(),
        activity_log: vec![],
        sync_id: None,
    };
    store.projects.push(project.clone());
    store.save()?;
    Ok(project)
}

#[tauri::command]
pub fn remove_project(state: State<AppState>, id: String) -> Result<(), String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    store.projects.retain(|p| p.id != id);
    store.save()
}

#[tauri::command]
pub fn update_project(
    state: State<AppState>,
    id: String,
    name: Option<String>,
    starred: Option<bool>,
    tags: Option<Vec<String>>,
    editors: Option<Vec<String>>,
) -> Result<Project, String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    let project = store.projects.iter_mut().find(|p| p.id == id).ok_or("Project not found")?;
    if let Some(n) = name { project.name = n; }
    if let Some(s) = starred { project.starred = s; }
    if let Some(t) = tags { project.tags = t; }
    if let Some(e) = editors { project.editors = e; }
    project.last_opened = chrono::Utc::now().to_rfc3339();
    project.activity_log.push(Activity {
        action: "opened".into(),
        detail: "Viewed project".into(),
        time: chrono::Utc::now().to_rfc3339(),
    });
    let result = project.clone();
    store.save()?;
    Ok(result)
}
