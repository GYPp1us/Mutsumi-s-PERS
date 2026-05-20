# Mutsumi Launcher MVP Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tauri v2 + React project launcher with system tray, global shortcut, project management, and template injection.

**Architecture:** Tauri v2 Rust backend handles system integration (tray/shortcut/autostart/shell), exposes IPC commands. React frontend renders the three-column UI. Data is stored in a single JSON file at `%APPDATA%\mutsumi-launcher\projects.json`.

**Tech Stack:** Tauri v2, React 18, Tailwind CSS 4, shadcn/ui, Zustand, Rust

---

## Task 1: Scaffold Tauri v2 + React Project

**Files:**
- Create: entire project scaffold

### Step 1: Create the Tauri project

```bash
npm create tauri-app@latest mutsumi-launcher -- --template react-ts
```

When prompted, use default settings. This creates the full project with `src-tauri/` and `src/`.

### Step 2: Install required dependencies

```bash
cd mutsumi-launcher
npm install
npm install zustand @tauri-apps/api
npm install -D tailwindcss @tailwindcss/vite
cargo add serde serde_json tauri-plugin-shell tauri-plugin-fs tauri-plugin-global-shortcut tauri-plugin-autostart
```

### Step 3: Configure Tailwind CSS

Write `src/App.css` (replace existing):

```css
@import "tailwindcss";

@theme {
  --color-base: #0d0d0d;
  --color-panel: #111111;
  --color-card: #141414;
  --color-hover: #1a1a1a;
  --color-primary: #3a5068;
  --color-primary-fg: #c0d0e0;
  --color-success: #4a5a4a;
  --color-warning: #6b5a4a;
  --color-tag: #1e2228;
  --color-tag-fg: #687888;
  --color-text: #e0e0e0;
  --color-text-secondary: #b0b0b0;
  --color-text-muted: #505050;
}

[data-theme="light"] {
  --color-base: #f5f4f0;
  --color-panel: #faf9f5;
  --color-card: #f0ede5;
  --color-hover: #e8e3d8;
  --color-primary: #c5d5e8;
  --color-primary-fg: #3a4a5a;
  --color-success: #5a7a5a;
  --color-warning: #c0a060;
  --color-tag: #e0ddd5;
  --color-tag-fg: #6a7070;
  --color-text: #2a2a2a;
  --color-text-secondary: #5a5a5a;
  --color-text-muted: #a0a0a0;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #root { height: 100%; background: var(--color-base); color: var(--color-text); font-family: 'Segoe UI', system-ui, sans-serif; font-size: 13px; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--color-hover); }
```

### Step 4: Configure Tauri for plugins

Write `src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mutsumi_launcher_lib::run()
}
```

Write `src-tauri/src/lib.rs`:

```rust
mod store;
mod commands;

use std::sync::Mutex;
use tauri::{Manager, PhysicalPosition, PhysicalSize};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

struct AppState {
    store: Mutex<store::AppStore>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

fn setup_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::{
        menu::{MenuBuilder, MenuItemBuilder},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };

    let show_item = MenuItemBuilder::with_id("show", "Show").build(app)?;
    let settings_item = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .item(&settings_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => { if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); } }
            "settings" => { /* TODO: open settings */ }
            "quit" => { app.exit(0); }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn setup_shortcut(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |_app, shortcut, _event| {
                if shortcut.matches(Modifiers::ALT, Code::Space) {
                    // toggle is handled by the builder
                }
            })
            .build(),
    )?;
    app.global_shortcut().register(shortcut)?;

    Ok(())
}

pub fn run() {
    let store = store::AppStore::load().unwrap_or_default();
    let state = AppState { store: Mutex::new(store) };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--flag1", "--flag2"]),
        ))
        .manage(state)
        .setup(|app| {
            setup_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::projects::list_projects,
            commands::projects::add_project,
            commands::projects::remove_project,
            commands::projects::update_project,
            commands::editors::launch_editor,
            commands::settings::get_settings,
            commands::settings::update_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Step 5: Configure Tauri permissions

Write `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:allow-open",
    "shell:allow-execute",
    "fs:allow-read",
    "fs:allow-write",
    "global-shortcut:allow-is-registered",
    "global-shortcut:allow-register",
    "global-shortcut:allow-unregister",
    "autostart:allow-enable",
    "autostart:allow-disable",
    "autostart:allow-is-enabled"
  ]
}
```

### Step 6: Verify scaffold builds

```bash
cargo tauri dev
```

Expected: window opens with Tauri + React welcome page.

### Step 7: Commit

```bash
git init
git add -A
git commit -m "feat: scaffold Tauri v2 + React + Tailwind project"
```

---

## Task 2: Rust — JSON Store

**Files:**
- Create: `src-tauri/src/store.rs`

### Step 1: Write the store module

Write `src-tauri/src/store.rs`:

```rust
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub theme: String,
    pub shortcut: String,
    pub autostart: bool,
    pub editors: Vec<EditorConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateMeta {
    pub name: String,
    pub category: String,
    pub tags: Vec<String>,
    pub variables: Vec<String>,
    pub conflict: String,
    pub post_create: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppStore {
    pub projects: Vec<Project>,
    pub settings: Settings,
}

impl AppStore {
    fn data_dir() -> PathBuf {
        let base = dirs_next().unwrap_or_else(|| PathBuf::from("."));
        base.join("mutsumi-launcher")
    }

    fn data_file() -> PathBuf {
        Self::data_dir().join("projects.json")
    }

    pub fn load() -> Option<Self> {
        let path = Self::data_file();
        if path.exists() {
            let content = fs::read_to_string(&path).ok()?;
            serde_json::from_str(&content).ok()
        } else {
            None
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

fn dirs_next() -> Option<PathBuf> {
    std::env::var("APPDATA")
        .ok()
        .map(PathBuf::from)
        .or_else(|| dirs::data_dir())
}
```

### Step 2: Add `dirs` crate

```bash
cd src-tauri; cargo add dirs
```

### Step 3: Verify compilation

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

### Step 4: Commit

```bash
git add src-tauri/src/store.rs src-tauri/Cargo.toml
git commit -m "feat: add JSON store module"
```

---

## Task 3: Rust — Project Commands (CRUD)

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/projects.rs`

### Step 1: Write commands module

Write `src-tauri/src/commands/mod.rs`:

```rust
pub mod projects;
pub mod editors;
pub mod git;
pub mod templates;
pub mod settings;
```

### Step 2: Write projects commands

Write `src-tauri/src/commands/projects.rs`:

```rust
use tauri::State;
use crate::store::{AppStore, Project, Activity};
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
pub fn update_project(state: State<AppState>, id: String, name: Option<String>, starred: Option<bool>, tags: Option<Vec<String>>, editors: Option<Vec<String>>) -> Result<Project, String> {
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
```

### Step 3: Add chrono and uuid crates

```bash
cd src-tauri; cargo add chrono uuid --features "uuid/v4"
```

### Step 4: Verify compilation

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

### Step 5: Commit

```bash
git add src-tauri/src/commands/ src-tauri/Cargo.toml
git commit -m "feat: add project CRUD commands"
```

---

## Task 4: Rust — Editor Launch & Settings Commands

**Files:**
- Create: `src-tauri/src/commands/editors.rs`
- Create: `src-tauri/src/commands/settings.rs`

### Step 1: Write editors command

Write `src-tauri/src/commands/editors.rs`:

```rust
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
```

### Step 2: Write settings commands

Write `src-tauri/src/commands/settings.rs`:

```rust
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
```

### Step 3: Register new commands in lib.rs

Add to invoke_handler in `src-tauri/src/lib.rs`:

```rust
commands::editors::launch_editor,
commands::settings::get_settings,
commands::settings::update_settings,
```

...with the existing entries. Also ensure `mod editors;` and `mod settings;` exist in `commands/mod.rs`.

### Step 4: Verify compilation

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

### Step 5: Commit

```bash
git add src-tauri/src/commands/editors.rs src-tauri/src/commands/settings.rs src-tauri/src/lib.rs
git commit -m "feat: add editor launch and settings commands"
```

---

## Task 5: Rust — Template & Git Commands

**Files:**
- Create: `src-tauri/src/commands/templates.rs`
- Create: `src-tauri/src/commands/git.rs`

### Step 1: Write templates command

Write `src-tauri/src/commands/templates.rs`:

```rust
use std::fs;
use std::path::Path;

#[tauri::command]
pub fn inject_template(template_path: String, target_path: String, variables: Vec<(String, String)>, conflict: String) -> Result<Vec<String>, String> {
    let mut injected: Vec<String> = vec![];
    copy_dir_recursive(Path::new(&template_path), Path::new(&target_path), &variables, &conflict, &mut injected)
        .map_err(|e| e.to_string())?;
    Ok(injected)
}

fn copy_dir_recursive(src: &Path, dst: &Path, vars: &[(String, String)], conflict: &str, injected: &mut Vec<String>) -> Result<(), std::io::Error> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if file_name == "template.json" { continue; }

        let resolved_name = apply_vars(&file_name, vars);
        let dst_path = dst.join(&resolved_name);

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path, vars, conflict, injected)?;
        } else {
            if dst_path.exists() && conflict == "skip" { continue; }
            let content = fs::read_to_string(&src_path).unwrap_or_default();
            fs::write(&dst_path, apply_vars(&content, vars))?;
            injected.push(dst_path.to_string_lossy().to_string());
        }
    }
    Ok(())
}

fn apply_vars(input: &str, vars: &[(String, String)]) -> String {
    let mut result = input.to_string();
    for (key, value) in vars {
        result = result.replace(&format!("{{{{ {} }}}}", key), value);
    }
    result
}
```

### Step 2: Write git commands

Write `src-tauri/src/commands/git.rs`:

```rust
use std::process::Command;

#[tauri::command]
pub async fn git_status(project_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["-C", &project_path, "status", "--porcelain", "-b"])
        .output()
        .map_err(|e| format!("git not found: {}", e))?;
    String::from_utf8(output.stdout).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_pull(project_path: String) -> Result<String, String> {
    let output = Command::new("git")
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
        .args(["-C", &project_path, "fetch", "--all"])
        .output()
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if output.status.success() { Ok(stdout) } else { Err(stderr) }
}
```

### Step 3: Register new commands in lib.rs

Ensure these are in `invoke_handler`:

```rust
commands::templates::inject_template,
commands::git::git_status,
commands::git::git_pull,
commands::git::git_push,
commands::git::git_fetch,
```

### Step 4: Commit

```bash
git add src-tauri/src/commands/templates.rs src-tauri/src/commands/git.rs src-tauri/src/lib.rs
git commit -m "feat: add template injection and git commands"
```

---

## Task 6: Frontend — State & IPC Layer

**Files:**
- Create: `src/lib/tauri.ts`
- Create: `src/lib/store.ts`
- Create: `src/lib/theme.ts`

### Step 1: Write Tauri IPC wrappers

Write `src/lib/tauri.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";

export interface Project {
  id: string;
  name: string;
  path: string;
  editors: string[];
  starred: boolean;
  tags: string[];
  last_opened: string;
  activity_log: Activity[];
  sync_id: string | null;
}

export interface Activity {
  action: string;
  detail: string;
  time: string;
}

export interface EditorConfig {
  id: string;
  name: string;
  path: string;
  args: string[];
}

export interface Settings {
  theme: string;
  shortcut: string;
  autostart: boolean;
  editors: EditorConfig[];
}

export const listProjects = () => invoke<Project[]>("list_projects");
export const addProject = (name: string, path: string) => invoke<Project>("add_project", { name, path });
export const removeProject = (id: string) => invoke<void>("remove_project", { id });
export const updateProject = (id: string, updates: Partial<Pick<Project, "name" | "starred" | "tags" | "editors">>) =>
  invoke<Project>("update_project", { id, ...updates });
export const launchEditor = (editorId: string, projectPath: string) => invoke<void>("launch_editor", { editorId, projectPath });
export const getSettings = () => invoke<Settings>("get_settings");
export const updateSettings = (settings: Settings) => invoke<void>("update_settings", { settings });
export const gitStatus = (projectPath: string) => invoke<string>("git_status", { projectPath });
export const gitPull = (projectPath: string) => invoke<string>("git_pull", { projectPath });
export const gitPush = (projectPath: string) => invoke<string>("git_push", { projectPath });
export const gitFetch = (projectPath: string) => invoke<string>("git_fetch", { projectPath });
export const injectTemplate = (templatePath: string, targetPath: string, variables: [string, string][], conflict: string) =>
  invoke<string[]>("inject_template", { templatePath, targetPath, variables, conflict });
```

### Step 2: Write Zustand store

Write `src/lib/store.ts`:

```ts
import { create } from "zustand";
import type { Project, Settings } from "./tauri";
import * as api from "./tauri";

type NavView = "home" | "projects" | "templates" | "git" | "settings";

interface AppStore {
  projects: Project[];
  settings: Settings | null;
  selectedProjectId: string | null;
  navView: NavView;
  theme: "dark" | "light";
  loadProjects: () => Promise<void>;
  loadSettings: () => Promise<void>;
  addProject: (name: string, path: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  toggleStar: (id: string, starred: boolean) => Promise<void>;
  selectProject: (id: string | null) => void;
  setNavView: (view: NavView) => void;
  toggleTheme: () => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  projects: [],
  settings: null,
  selectedProjectId: null,
  navView: "projects",
  theme: (localStorage.getItem("mutsumi-theme") as "dark" | "light") || "dark",

  loadProjects: async () => {
    const projects = await api.listProjects();
    set({ projects });
  },
  loadSettings: async () => {
    const settings = await api.getSettings();
    set({ settings });
  },
  addProject: async (name, path) => {
    const project = await api.addProject(name, path);
    set({ projects: [...get().projects, project], selectedProjectId: project.id, navView: "projects" });
  },
  removeProject: async (id) => {
    await api.removeProject(id);
    const state = get();
    set({
      projects: state.projects.filter((p) => p.id !== id),
      selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
    });
  },
  toggleStar: async (id, starred) => {
    await api.updateProject(id, { starred });
    set({
      projects: get().projects.map((p) => (p.id === id ? { ...p, starred } : p)),
    });
  },
  selectProject: (id) => set({ selectedProjectId: id }),
  setNavView: (view) => set({ navView: view }),
  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem("mutsumi-theme", next);
    document.documentElement.setAttribute("data-theme", next);
    set({ theme: next });
  },
}));
```

### Step 3: Write theme initializer

Write `src/lib/theme.ts`:

```ts
export function initTheme() {
  const saved = localStorage.getItem("mutsumi-theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
}
```

### Step 4: Commit

```bash
git add src/lib/
git commit -m "feat: add frontend state and IPC layer"
```

---

## Task 7: Frontend — App Shell & Layout Components

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Create: `src/components/LeftNav.tsx`
- Create: `src/components/RightPanel.tsx`
- Create: `src/components/ProjectList.tsx`

### Step 1: Update main.tsx

Write `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { initTheme } from "./lib/theme";

initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### Step 2: Write App.tsx with three-column layout

Write `src/App.tsx`:

```tsx
import { useEffect } from "react";
import { useAppStore } from "./lib/store";
import { LeftNav } from "./components/LeftNav";
import { ProjectList } from "./components/ProjectList";
import { RightPanel } from "./components/RightPanel";

export default function App() {
  const theme = useAppStore((s) => s.theme);
  const loadProjects = useAppStore((s) => s.loadProjects);
  const loadSettings = useAppStore((s) => s.loadSettings);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    loadProjects();
    loadSettings();
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--color-base)" }}>
      <LeftNav />
      <ProjectList />
      <RightPanel />
    </div>
  );
}
```

### Step 3: Write LeftNav

Write `src/components/LeftNav.tsx`:

```tsx
import { useAppStore } from "../lib/store";

const navItems = [
  { id: "home" as const, icon: "⌂", label: "Home" },
  { id: "projects" as const, icon: "☷", label: "Projects" },
  { id: "templates" as const, icon: "❐", label: "Templates" },
  { id: "git" as const, icon: "↻", label: "Git" },
];

export function LeftNav() {
  const navView = useAppStore((s) => s.navView);
  const setNavView = useAppStore((s) => s.setNavView);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  return (
    <nav style={{
      width: 56, background: "var(--color-base)", display: "flex", flexDirection: "column",
      alignItems: "center", padding: "16px 0", gap: 20, flexShrink: 0,
    }}>
      <div style={{ fontSize: 18, opacity: 0.8, marginBottom: 8 }}>◇</div>
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => setNavView(item.id)}
          title={item.label}
          style={{
            width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, opacity: navView === item.id ? 1 : 0.35, background: navView === item.id ? "var(--color-hover)" : "transparent",
            border: "none", color: "inherit", cursor: "pointer",
          }}
        >
          {item.icon}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <button
        onClick={() => { setNavView("settings"); }}
        title="Settings"
        style={{
          width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, opacity: navView === "settings" ? 1 : 0.35, background: navView === "settings" ? "var(--color-hover)" : "transparent",
          border: "none", color: "inherit", cursor: "pointer",
        }}
      >
        ⚙
      </button>
      <button
        onClick={toggleTheme}
        title="Toggle theme"
        style={{
          width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, opacity: 0.7, background: "transparent",
          border: "none", color: "inherit", cursor: "pointer",
        }}
      >
        {theme === "dark" ? "◉" : "○"}
      </button>
    </nav>
  );
}
```

### Step 4: Write ProjectList

Write `src/components/ProjectList.tsx`:

```tsx
import { useState } from "react";
import { useAppStore } from "../lib/store";

export function ProjectList() {
  const projects = useAppStore((s) => s.projects);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const selectProject = useAppStore((s) => s.selectProject);
  const addProject = useAppStore((s) => s.addProject);
  const navView = useAppStore((s) => s.navView);
  const [filter, setFilter] = useState("");

  const filteredList = filter
    ? projects.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()))
    : projects;

  const handleAdd = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false, title: "Select project folder" });
      if (dir) {
        const name = dir.split(/[\\/]/).pop() || "unnamed";
        await addProject(name, dir as string);
      }
    } catch (e) {
      console.error("Failed to add project:", e);
    }
  };

  return (
    <div style={{
      width: 260, background: "var(--color-base)", display: "flex", flexDirection: "column",
      flexShrink: 0, borderRight: "1px solid var(--color-hover)",
    }}>
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>Projects</span>
        <button onClick={handleAdd} style={{
          background: "none", border: "none", color: "var(--color-text-muted)",
          fontSize: 18, cursor: "pointer",
        }}>+</button>
      </div>
      <input
        type="text"
        placeholder="Filter projects..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          margin: "0 12px 8px", background: "var(--color-card)", color: "var(--color-text-secondary)",
          border: "none", padding: "7px 12px", fontSize: 12, outline: "none",
        }}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {/* Home item */}
        <div
          onClick={() => selectProject(null)}
          style={{
            padding: "8px 14px", margin: "1px 4px", display: "flex", alignItems: "center", gap: 8,
            cursor: "pointer", opacity: 0.6, background: "transparent",
          }}
        >
          <span>⌂</span>
          <span style={{ color: "var(--color-text-secondary)" }}>Home</span>
        </div>

        {filteredList.map((project) => (
          <div
            key={project.id}
            onClick={() => selectProject(project.id)}
            style={{
              padding: "8px 14px", margin: "1px 4px", display: "flex", alignItems: "center", gap: 8,
              cursor: "pointer", background: selectedProjectId === project.id ? "var(--color-hover)" : "transparent",
            }}
          >
            <span style={{ fontSize: 14 }}>▣</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {project.name}
              </div>
              <div style={{ fontSize: 10, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {project.path}
              </div>
            </div>
            {project.starred && <span style={{ fontSize: 10, color: "var(--color-warning)" }}>★</span>}
          </div>
        ))}
      </div>

      <div style={{ padding: 8, borderTop: "1px solid var(--color-hover)", fontSize: 10, color: "var(--color-text-muted)", textAlign: "center" }}>
        {projects.length} project{projects.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
```

### Step 5: Write RightPanel (router)

Write `src/components/RightPanel.tsx`:

```tsx
import { useAppStore } from "../lib/store";
import { HomeView } from "./HomeView";
import { ProjectDetail } from "./ProjectDetail";
import { TemplateView } from "./TemplateView";
import { GitView } from "./GitView";
import { SettingsView } from "./SettingsView";

export function RightPanel() {
  const navView = useAppStore((s) => s.navView);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);

  const renderContent = () => {
    switch (navView) {
      case "home":
        return <HomeView />;
      case "projects":
        return selectedProjectId ? <ProjectDetail /> : <HomeView />;
      case "templates":
        return <TemplateView />;
      case "git":
        return <GitView />;
      case "settings":
        return <SettingsView />;
      default:
        return <HomeView />;
    }
  };

  return (
    <div style={{
      flex: 1, background: "var(--color-panel)", padding: "20px 24px",
      display: "flex", flexDirection: "column", gap: 18, overflowY: "auto",
    }}>
      {renderContent()}
    </div>
  );
}
```

### Step 6: Install dialog plugin

```bash
npm install @tauri-apps/plugin-dialog
cargo add tauri-plugin-dialog
```

Add `"dialog:allow-open"` to capabilities/default.json.

### Step 7: Commit

```bash
git add src/ src-tauri/
git commit -m "feat: add app shell, nav, project list, and layout"
```

---

## Task 8: Frontend — HomeView & ProjectDetail

**Files:**
- Create: `src/components/HomeView.tsx`
- Create: `src/components/ProjectDetail.tsx`

### Step 1: Write HomeView

Write `src/components/HomeView.tsx`:

```tsx
import { useAppStore } from "../lib/store";

export function HomeView() {
  const projects = useAppStore((s) => s.projects);
  const selectProject = useAppStore((s) => s.selectProject);

  const recent = [...projects]
    .sort((a, b) => new Date(b.last_opened).getTime() - new Date(a.last_opened).getTime())
    .slice(0, 5);

  const starred = projects.filter((p) => p.starred);

  return (
    <>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text)", margin: 0 }}>Home</h2>

      <div style={{ background: "var(--color-card)", padding: "14px 16px" }}>
        <div style={{
          fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase",
          letterSpacing: "0.5px", marginBottom: 10,
        }}>Recent Projects</div>
        {recent.length === 0 ? (
          <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>No projects yet. Add one with the + button.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recent.map((p) => (
              <div
                key={p.id}
                onClick={() => selectProject(p.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 0", cursor: "pointer",
                }}
              >
                <div>
                  <div style={{ color: "#58a6ff", fontSize: 13 }}>▣ {p.name}</div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                    {new Date(p.last_opened).toLocaleDateString()}
                  </div>
                </div>
                {p.starred && <span style={{ color: "var(--color-warning)", fontSize: 12 }}>★</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: "var(--color-card)", padding: "14px 16px" }}>
        <div style={{
          fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase",
          letterSpacing: "0.5px", marginBottom: 10,
        }}>Starred</div>
        {starred.length === 0 ? (
          <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>No starred projects yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {starred.map((p) => (
              <div
                key={p.id}
                onClick={() => selectProject(p.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 0", cursor: "pointer",
                }}
              >
                <div>
                  <div style={{ color: "#58a6ff", fontSize: 13 }}>▣ {p.name}</div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{p.path}</div>
                </div>
                <span style={{ color: "var(--color-warning)", fontSize: 12 }}>★</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
```

### Step 2: Write ProjectDetail

Write `src/components/ProjectDetail.tsx`:

```tsx
import { useAppStore } from "../lib/store";
import * as api from "../lib/tauri";

export function ProjectDetail() {
  const selectedId = useAppStore((s) => s.selectedProjectId);
  const projects = useAppStore((s) => s.projects);
  const settings = useAppStore((s) => s.settings);
  const toggleStar = useAppStore((s) => s.toggleStar);

  const project = projects.find((p) => p.id === selectedId);
  if (!project) return <div style={{ color: "var(--color-text-muted)" }}>Select a project</div>;

  const handleLaunch = async (editorId: string) => {
    try { await api.launchEditor(editorId, project.path); } catch (e) { console.error(e); }
  };

  const handleLaunchAll = async () => {
    const editors = project.editors.length > 0 ? project.editors : settings?.editors.map((e) => e.id) || [];
    for (const id of editors) { await handleLaunch(id); }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text)", margin: 0 }}>{project.name}</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>{project.path}</div>
        </div>
        <button
          onClick={() => toggleStar(project.id, !project.starred)}
          style={{
            background: "none", border: "none", fontSize: 18, cursor: "pointer",
            color: project.starred ? "var(--color-warning)" : "var(--color-text-muted)",
          }}
        >
          ★
        </button>
      </div>

      {/* Launch */}
      <div style={{ background: "var(--color-card)", padding: "14px 16px" }}>
        <div style={{
          fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase",
          letterSpacing: "0.5px", marginBottom: 10,
        }}>Launch Environment</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(settings?.editors || []).map((ed) => (
            <button
              key={ed.id}
              onClick={() => handleLaunch(ed.id)}
              style={{
                background: "var(--color-primary)", color: "var(--color-primary-fg)",
                border: "none", padding: "6px 14px", fontSize: 12, cursor: "pointer",
              }}
            >
              {ed.name}
            </button>
          ))}
          <button
            onClick={handleLaunchAll}
            style={{
              background: "var(--color-card)", color: "var(--color-text-secondary)",
              border: "none", padding: "6px 14px", fontSize: 12, cursor: "pointer",
            }}
          >
            ▶ All
          </button>
        </div>
      </div>

      {/* Tags + Info */}
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1, background: "var(--color-card)", padding: "12px 14px" }}>
          <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Tags</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {project.tags.length > 0
              ? project.tags.map((t) => (
                  <span key={t} style={{ background: "var(--color-tag)", color: "var(--color-tag-fg)", padding: "2px 8px", fontSize: 11 }}>
                    {t}
                  </span>
                ))
              : <span style={{color:"var(--color-text-muted)",fontSize:11}}>No tags</span>}
          </div>
        </div>
        <div style={{ flex: 1, background: "var(--color-card)", padding: "12px 14px" }}>
          <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Last Opened</div>
          <div style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>{new Date(project.last_opened).toLocaleString()}</div>
        </div>
      </div>

      {/* Activity */}
      {project.activity_log.length > 0 && (
        <div style={{ background: "var(--color-card)", padding: "14px 16px" }}>
          <div style={{
            fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase",
            letterSpacing: "0.5px", marginBottom: 8,
          }}>Recent Activity</div>
          {project.activity_log.slice(-5).reverse().map((a, i) => (
            <div key={i} style={{ fontSize: 11, color: "var(--color-text-muted)", padding: "2px 0" }}>
              {a.action} {a.detail} — {new Date(a.time).toLocaleString()}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
```

### Step 3: Commit

```bash
git add src/components/HomeView.tsx src/components/ProjectDetail.tsx
git commit -m "feat: add HomeView and ProjectDetail components"
```

---

## Task 9: Frontend — TemplateView

**Files:**
- Create: `src/components/TemplateView.tsx`

### Step 1: Write TemplateView

Write `src/components/TemplateView.tsx`:

```tsx
import { useState } from "react";
import { useAppStore } from "../lib/store";
import * as api from "../lib/tauri";

// Hardcoded template paths for MVP; P1 will make these configurable
const BUILTIN_TEMPLATES = [
  { id: "academic-latex", name: "Academic LaTeX", category: "writing", description: "main.tex + refs.bib", path: "" },
];

export function TemplateView() {
  const projects = useAppStore((s) => s.projects);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [targetProjectId, setTargetProjectId] = useState<string>("");
  const [variables, setVariables] = useState<[string, string][]>([]);
  const [status, setStatus] = useState<string>("");

  const handleInject = async () => {
    const template = BUILTIN_TEMPLATES.find((t) => t.id === selectedTemplate);
    const target = projects.find((p) => p.id === targetProjectId);
    if (!template || !target) return;
    setStatus("Injecting...");
    try {
      const result = await api.injectTemplate(template.path, target.path, variables, "skip");
      setStatus(`Injected ${result.length} files → ${target.name}`);
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  };

  return (
    <>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text)", margin: 0 }}>Templates</h2>

      <div style={{ background: "var(--color-card)", padding: "14px 16px" }}>
        <div style={{
          fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase",
          letterSpacing: "0.5px", marginBottom: 10,
        }}>Available Templates</div>
        {BUILTIN_TEMPLATES.map((t) => (
          <div
            key={t.id}
            onClick={() => setSelectedTemplate(t.id)}
            style={{
              padding: "10px 14px", cursor: "pointer",
              background: selectedTemplate === t.id ? "var(--color-hover)" : "transparent",
            }}
          >
            <div style={{ color: "var(--color-text)" }}>❐ {t.name}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              {t.category} · {t.description}
            </div>
          </div>
        ))}
      </div>

      {selectedTemplate && (
        <div style={{ background: "var(--color-card)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{
            fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}>Target Project</div>
          <select
            value={targetProjectId}
            onChange={(e) => setTargetProjectId(e.target.value)}
            style={{
              background: "var(--color-card)", color: "var(--color-text)", border: "none",
              padding: "8px 12px", fontSize: 12,
            }}
          >
            <option value="">Select project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <button
            onClick={handleInject}
            disabled={!targetProjectId}
            style={{
              background: targetProjectId ? "var(--color-primary)" : "var(--color-card)",
              color: targetProjectId ? "var(--color-primary-fg)" : "var(--color-text-muted)",
              border: "none", padding: "8px 16px", fontSize: 12, cursor: targetProjectId ? "pointer" : "default",
              alignSelf: "flex-start",
            }}
          >
            Inject Template
          </button>

          {status && <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{status}</div>}
        </div>
      )}
    </>
  );
}
```

### Step 2: Commit

```bash
git add src/components/TemplateView.tsx
git commit -m "feat: add TemplateView component"
```

---

## Task 10: Frontend — GitView & SettingsView

**Files:**
- Create: `src/components/GitView.tsx`
- Create: `src/components/SettingsView.tsx`

### Step 1: Write GitView

Write `src/components/GitView.tsx`:

```tsx
import { useState } from "react";
import { useAppStore } from "../lib/store";
import * as api from "../lib/tauri";

export function GitView() {
  const selectedId = useAppStore((s) => s.selectedProjectId);
  const projects = useAppStore((s) => s.projects);
  const project = projects.find((p) => p.id === selectedId);
  const [status, setStatus] = useState<string>("");
  const [output, setOutput] = useState<string>("");

  if (!project) {
    return <div style={{ color: "var(--color-text-muted)" }}>Select a project first</div>;
  }

  const runGit = async (op: string, fn: (path: string) => Promise<string>) => {
    setStatus(`Running git ${op}...`);
    try {
      const result = await fn(project.path);
      setOutput(result || "Done.");
      setStatus("");
    } catch (e) {
      setOutput(String(e));
      setStatus("");
    }
  };

  return (
    <>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text)", margin: 0 }}>
        Git — {project.name}
      </h2>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{project.path}</div>

      <div style={{ background: "var(--color-card)", padding: "14px 16px" }}>
        <div style={{
          fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase",
          letterSpacing: "0.5px", marginBottom: 10,
        }}>Operations</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            ["Fetch", () => api.gitFetch(project.path)],
            ["Pull", () => api.gitPull(project.path)],
            ["Push", () => api.gitPush(project.path)],
            ["Status", () => api.gitStatus(project.path)],
          ].map(([label, fn]) => (
            <button
              key={label as string}
              onClick={() => runGit(label as string, fn as any)}
              style={{
                background: "var(--color-card)", color: "var(--color-text-secondary)",
                border: "none", padding: "6px 14px", fontSize: 12, cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {status && <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 8 }}>{status}</div>}
      </div>

      {output && (
        <div style={{ background: "var(--color-card)", padding: "14px 16px" }}>
          <div style={{
            fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase",
            letterSpacing: "0.5px", marginBottom: 8,
          }}>Output</div>
          <pre style={{ fontSize: 11, color: "var(--color-text-secondary)", whiteSpace: "pre-wrap", margin: 0 }}>
            {output}
          </pre>
        </div>
      )}
    </>
  );
}
```

### Step 2: Write SettingsView

Write `src/components/SettingsView.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useAppStore } from "../lib/store";
import type { EditorConfig } from "../lib/tauri";
import * as api from "../lib/tauri";

export function SettingsView() {
  const settings = useAppStore((s) => s.settings);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  const [editors, setEditors] = useState<EditorConfig[]>([]);
  const [shortcut, setShortcut] = useState("");

  useEffect(() => {
    if (settings) {
      setEditors(settings.editors);
      setShortcut(settings.shortcut);
    }
  }, [settings]);

  const handleSave = async () => {
    if (!settings) return;
    await api.updateSettings({ ...settings, shortcut, editors });
    await loadSettings();
  };

  const addEditor = () => {
    setEditors([
      ...editors,
      { id: `editor-${Date.now()}`, name: "", path: "", args: ["{path}"] },
    ]);
  };

  const updateEditor = (idx: number, field: keyof EditorConfig, value: string | string[]) => {
    const updated = editors.map((e, i) => (i === idx ? { ...e, [field]: value } : e));
    setEditors(updated);
  };

  const removeEditor = (idx: number) => {
    setEditors(editors.filter((_, i) => i !== idx));
  };

  return (
    <>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text)", margin: 0 }}>Settings</h2>

      {/* Theme */}
      <div style={{ background: "var(--color-card)", padding: "14px 16px" }}>
        <div style={{
          fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase",
          letterSpacing: "0.5px", marginBottom: 10,
        }}>Appearance</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "var(--color-text-secondary)" }}>Theme:</span>
          <button
            onClick={toggleTheme}
            style={{
              background: "var(--color-primary)", color: "var(--color-primary-fg)",
              border: "none", padding: "6px 14px", fontSize: 12, cursor: "pointer",
            }}
          >
            {theme === "dark" ? "◉ Dark" : "○ Light"}
          </button>
        </div>
      </div>

      {/* Shortcut */}
      <div style={{ background: "var(--color-card)", padding: "14px 16px" }}>
        <div style={{
          fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase",
          letterSpacing: "0.5px", marginBottom: 10,
        }}>Global Shortcut</div>
        <input
          type="text"
          value={shortcut}
          onChange={(e) => setShortcut(e.target.value)}
          placeholder="Alt+Space"
          style={{
            background: "var(--color-hover)", color: "var(--color-text)", border: "none",
            padding: "8px 12px", fontSize: 13, outline: "none", width: 200,
          }}
        />
      </div>

      {/* Editors */}
      <div style={{ background: "var(--color-card)", padding: "14px 16px" }}>
        <div style={{
          fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase",
          letterSpacing: "0.5px", marginBottom: 10, display: "flex", justifyContent: "space-between",
        }}>
          <span>Editors</span>
          <button onClick={addEditor} style={{
            background: "none", border: "none", color: "var(--color-text-muted)",
            fontSize: 16, cursor: "pointer",
          }}>+</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {editors.map((ed, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                placeholder="Name"
                value={ed.name}
                onChange={(e) => updateEditor(i, "name", e.target.value)}
                style={{
                  background: "var(--color-hover)", color: "var(--color-text)", border: "none",
                  padding: "6px 10px", fontSize: 12, outline: "none", width: 90,
                }}
              />
              <input
                placeholder="Path"
                value={ed.path}
                onChange={(e) => updateEditor(i, "path", e.target.value)}
                style={{
                  background: "var(--color-hover)", color: "var(--color-text)", border: "none",
                  padding: "6px 10px", fontSize: 12, outline: "none", flex: 1,
                }}
              />
              <input
                placeholder="Args (comma-separated)"
                value={ed.args.join(", ")}
                onChange={(e) => updateEditor(i, "args", e.target.value.split(",").map((s) => s.trim()))}
                style={{
                  background: "var(--color-hover)", color: "var(--color-text)", border: "none",
                  padding: "6px 10px", fontSize: 11, outline: "none", width: 140,
                }}
              />
              <button onClick={() => removeEditor(i)} style={{
                background: "none", border: "none", color: "var(--color-text-muted)",
                fontSize: 14, cursor: "pointer",
              }}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        style={{
          background: "var(--color-success)", color: "#c0d0c0",
          border: "none", padding: "8px 20px", fontSize: 12, cursor: "pointer",
          alignSelf: "flex-start",
        }}
      >
        Save Settings
      </button>
    </>
  );
}
```

### Step 3: Commit

```bash
git add src/components/GitView.tsx src/components/SettingsView.tsx
git commit -m "feat: add GitView and SettingsView components"
```

---

## Task 11: Tauri Config & Startup Polish

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`

### Step 1: Configure tauri.conf.json for window

Update `src-tauri/tauri.conf.json` window section:

```json
{
  "app": {
    "windows": [
      {
        "title": "Mutsumi Launcher",
        "width": 960,
        "height": 620,
        "minWidth": 800,
        "minHeight": 480,
        "resizable": true,
        "decorations": true,
        "visible": false,
        "center": true
      }
    ]
  }
}
```

### Step 2: Add Cargo.toml metadata

Ensure `src-tauri/Cargo.toml` has:

```toml
[package]
name = "mutsumi-launcher"
version = "0.1.0"
edition = "2021"
```

### Step 3: Add default settings initialization in store.rs

In `AppStore::load()`, return defaults when file doesn't exist:

```rust
pub fn load_or_default() -> Self {
    Self::load().unwrap_or_else(|| {
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
    })
}
```

Update `lib.rs` to use `load_or_default()` instead of `load().unwrap_or_default()`.

### Step 4: Full build test

```bash
cargo tauri build --debug
```

### Step 5: Commit

```bash
git add -A
git commit -m "feat: configure window, add default settings, build polish"
```

---

## Plan Summary

| Task | Component | Est. Time |
|------|-----------|-----------|
| 1 | Scaffold project | 5 min |
| 2 | JSON Store | 5 min |
| 3 | Project CRUD commands | 5 min |
| 4 | Editor & Settings commands | 5 min |
| 5 | Template & Git commands | 5 min |
| 6 | Frontend state layer | 5 min |
| 7 | App shell & layout | 10 min |
| 8 | HomeView & ProjectDetail | 10 min |
| 9 | TemplateView | 5 min |
| 10 | GitView & SettingsView | 10 min |
| 11 | Config & polish | 5 min |
| **Total** | | **~70 min** |
