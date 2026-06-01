use tauri::State;
use std::fs;
use crate::store::{Project, Activity, AppStore};
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
        group_id: None,
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

#[tauri::command]
pub fn reorder_projects(state: State<AppState>, ids: Vec<String>) -> Result<(), String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    let mut ordered = Vec::with_capacity(store.projects.len());
    for id in &ids {
        if let Some(pos) = store.projects.iter().position(|p| &p.id == id) {
            ordered.push(store.projects.remove(pos));
        }
    }
    ordered.extend(store.projects.drain(..));
    store.projects = ordered;
    store.save()
}

#[tauri::command]
pub fn create_project(
    state: State<AppState>,
    name: String,
    path: String,
    template_name: Option<String>,
) -> Result<Project, String> {
    if !path.is_empty() {
        fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
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
        group_id: None,
    };
    store.projects.push(project.clone());
    store.save()?;

    if let Some(tn) = template_name {
        if !tn.is_empty() {
            let template_path = AppStore::templates_dir().join(&tn);
            if template_path.exists() && template_path.is_dir() {
                let target = std::path::Path::new(&project.path);
                let mut injected: Vec<String> = vec![];
                if let Err(e) = super::templates::copy_dir_inner(
                    &template_path,
                    target,
                    &[],
                    "skip",
                    &mut injected,
                ) {
                    log::warn!("Template injection failed: {}", e);
                }
            }
        }
    }

    Ok(project)
}
