use std::fs;
use crate::store::{AppStore, TemplateMeta};

#[derive(serde::Serialize)]
pub struct TemplateInfo {
    pub name: String,
    pub description: String,
    pub file_count: usize,
}

#[derive(serde::Deserialize)]
pub struct TemplateFile {
    pub name: String,
    pub content: String,
}

#[tauri::command]
pub fn list_templates() -> Result<Vec<TemplateInfo>, String> {
    let dir = AppStore::templates_dir();
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut result = vec![];
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let meta_path = entry.path().join("template.json");
        if !meta_path.exists() {
            continue;
        }
        let meta: TemplateMeta = serde_json::from_str(
            &fs::read_to_string(&meta_path).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;

        let mut file_count = 0usize;
        if let Ok(entries) = fs::read_dir(entry.path()) {
            file_count = entries.filter_map(|e| e.ok())
                .filter(|e| e.file_name() != "template.json")
                .count();
        }

        result.push(TemplateInfo {
            name: meta.name,
            description: meta.description,
            file_count,
        });
    }
    Ok(result)
}

#[tauri::command]
pub fn create_template(
    name: String,
    description: String,
    files: Vec<TemplateFile>,
) -> Result<(), String> {
    let dir = AppStore::templates_dir().join(&name);
    if dir.exists() {
        return Err(format!("Template \"{}\" already exists", name));
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let meta = TemplateMeta {
        name: name.clone(),
        description,
        version: "1.0".into(),
    };
    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(dir.join("template.json"), meta_json).map_err(|e| e.to_string())?;

    for f in &files {
        let file_path = dir.join(sanitize_filename(&f.name));
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&file_path, &f.content).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn remove_template(name: String) -> Result<(), String> {
    let dir = AppStore::templates_dir().join(&name);
    if !dir.exists() {
        return Err(format!("Template \"{}\" not found", name));
    }
    fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(())
}

fn sanitize_filename(name: &str) -> String {
    name.replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_")
        .trim()
        .to_string()
}
