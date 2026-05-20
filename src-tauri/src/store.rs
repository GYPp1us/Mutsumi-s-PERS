use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub editors: Vec<String>,
    pub starred: bool,
    pub tags: Vec<String>,
    pub last_opened: String,
    pub activity_log: Vec<Activity>,
    pub sync_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Activity {
    pub action: String,
    pub detail: String,
    pub time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorConfig {
    pub id: String,
    pub name: String,
    pub path: String,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    pub theme: String,
    pub shortcut: String,
    pub autostart: bool,
    pub editors: Vec<EditorConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppStore {
    pub projects: Vec<Project>,
    pub settings: Settings,
}

impl AppStore {
    fn data_dir() -> PathBuf {
        let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        base.join("mutsumi-launcher")
    }

    fn data_file() -> PathBuf {
        Self::data_dir().join("projects.json")
    }

    pub fn load_or_default() -> Self {
        let path = Self::data_file();
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(store) = serde_json::from_str::<AppStore>(&content) {
                    return store;
                }
            }
        }
        AppStore {
            projects: vec![],
            settings: Settings {
                theme: "dark".into(),
                shortcut: "Alt+Space".into(),
                autostart: false,
                editors: vec![
                    EditorConfig {
                        id: "vscode".into(),
                        name: "VS Code".into(),
                        path: "code".into(),
                        args: vec!["{path}".into()],
                    },
                    EditorConfig {
                        id: "terminal".into(),
                        name: "Terminal".into(),
                        path: "wt.exe".into(),
                        args: vec!["-d".into(), "{path}".into()],
                    },
                ],
            },
        }
    }

    pub fn save(&self) -> Result<(), String> {
        let dir = Self::data_dir();
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let content = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(Self::data_file(), content).map_err(|e| e.to_string())?;
        Ok(())
    }
}
