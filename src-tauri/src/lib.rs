mod store;
mod commands;

use std::io::Write;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
#[allow(unused_imports)]
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

pub struct AppState {
    pub store: Mutex<store::AppStore>,
    pub pinned: AtomicBool,
    pub drag_pinned: AtomicBool,
}

fn show_window_on_active_monitor(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };

    let Ok(cursor) = app.cursor_position() else { return };
    let Ok(monitors) = app.available_monitors() else { return };

    for m in &monitors {
        let pos = m.position();
        let size = m.size();
        let x_min = pos.x as f64;
        let y_min = pos.y as f64;
        let x_max = x_min + size.width as f64;
        let y_max = y_min + size.height as f64;

        if cursor.x >= x_min && cursor.x < x_max && cursor.y >= y_min && cursor.y < y_max {
            let Ok(win_size) = window.outer_size() else { continue };
            let x = x_min + ((size.width as f64 - win_size.width as f64) / 2.0).max(0.0);
            let y = y_min + ((size.height as f64 - win_size.height as f64) / 2.0).max(0.0);
            let _ = window.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
            break;
        }
    }

    app.state::<AppState>().pinned.store(false, Ordering::Relaxed);
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit("app-shown", ());
}

fn log_startup_error(context: &str, err: &dyn std::fmt::Display) {
    let msg = format!("[startup] {context}: {err}");
    eprintln!("{msg}");
    if let Some(dir) = dirs::config_dir() {
        let path = dir.join("mutsumi-s-pres").join("startup_error.log");
        let _ = std::fs::OpenOptions::new()
            .create(true).append(true).open(&path)
            .and_then(|mut f| writeln!(f, "{msg}"));
    }
}

fn setup_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
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
            "show" => show_window_on_active_monitor(app),
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window_on_active_monitor(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn set_pinned(state: tauri::State<'_, AppState>, pinned: bool) {
    state.pinned.store(pinned, Ordering::Relaxed);
}

#[tauri::command]
fn start_drag_pin(state: tauri::State<'_, AppState>) {
    state.drag_pinned.store(true, Ordering::Relaxed);
}

#[tauri::command]
fn update_shortcut(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    key_code: String,
    ctrl: bool,
    alt: bool,
    shift: bool,
    meta: bool,
) -> Result<(), String> {
    use std::str::FromStr;

    let mut modifiers = Modifiers::empty();
    if ctrl { modifiers |= Modifiers::CONTROL; }
    if alt { modifiers |= Modifiers::ALT; }
    if shift { modifiers |= Modifiers::SHIFT; }
    if meta { modifiers |= Modifiers::SUPER; }

    let code = Code::from_str(&key_code).map_err(|_| format!("unknown key: {key_code}"))?;
    let shortcut = Shortcut::new(Some(modifiers), code);

    app.global_shortcut().register(shortcut).map_err(|e| e.to_string())?;

    let display = shortcut_display_name(&key_code, ctrl, alt, shift, meta);
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    store.settings.shortcut = display;
    store.settings.setup_completed = true;
    store.save()?;

    Ok(())
}

fn parse_shortcut(s: &str) -> Result<Shortcut, String> {
    use std::str::FromStr;

    let parts: Vec<&str> = s.split('+').collect();
    if parts.is_empty() {
        return Err("empty shortcut".into());
    }

    let mut modifiers = Modifiers::empty();
    let mut key = None;

    for part in parts {
        let lower = part.trim().to_lowercase();
        match lower.as_str() {
            "ctrl" | "control" => modifiers |= Modifiers::CONTROL,
            "alt" => modifiers |= Modifiers::ALT,
            "shift" => modifiers |= Modifiers::SHIFT,
            "win" | "super" | "meta" | "cmd" => modifiers |= Modifiers::SUPER,
            _ => {
                if key.is_some() {
                    return Err(format!("multiple keys in shortcut: {s}"));
                }
                let trimmed = part.trim();
                let code = Code::from_str(trimmed).ok().or_else(|| {
                    if trimmed.len() == 1 {
                        let c = trimmed.chars().next().unwrap();
                        if c.is_ascii_alphabetic() {
                            Code::from_str(&format!("Key{}", c.to_ascii_uppercase())).ok()
                        } else if c.is_ascii_digit() {
                            Code::from_str(&format!("Digit{}", c)).ok()
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                }).ok_or_else(|| format!("unknown key: {trimmed}"))?;
                key = Some(code);
            }
        }
    }

    let key_code = key.ok_or_else(|| format!("no key in shortcut: {s}"))?;
    Ok(Shortcut::new(Some(modifiers), key_code))
}

fn shortcut_display_name(key_code: &str, ctrl: bool, alt: bool, shift: bool, meta: bool) -> String {
    let mut parts = Vec::new();
    if ctrl { parts.push("Ctrl"); }
    if alt { parts.push("Alt"); }
    if shift { parts.push("Shift"); }
    if meta { parts.push("Win"); }

    let key = key_code
        .strip_prefix("Key")
        .or_else(|| key_code.strip_prefix("Digit"))
        .unwrap_or(key_code);
    parts.push(key);
    parts.join("+")
}

fn setup_shortcut(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, _shortcut, _event| {
                show_window_on_active_monitor(app);
            })
            .build(),
    )?;

    let shortcut_str = app.state::<AppState>().store.lock().ok()
        .map(|s| s.settings.shortcut.clone())
        .unwrap_or_default();

    if !shortcut_str.is_empty() && shortcut_str != "Alt+Space" {
        if let Ok(shortcut) = parse_shortcut(&shortcut_str) {
            let _ = app.global_shortcut().register(shortcut);
        }
    }

    // Always also try Alt+Space as a sensible default
    let alt_space = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    let _ = app.global_shortcut().register(alt_space);

    Ok(())
}

pub fn run() {
    let store = store::AppStore::load_or_default();
    let state = AppState {
        store: Mutex::new(store),
        pinned: AtomicBool::new(false),
        drag_pinned: AtomicBool::new(false),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .on_window_event(|window, event| {
            let state = window.state::<AppState>();
            match event {
                tauri::WindowEvent::Focused(true) => {
                    state.drag_pinned.store(false, Ordering::Relaxed);
                }
                tauri::WindowEvent::Focused(false) => {
                    if !state.pinned.load(Ordering::Relaxed)
                        && !state.drag_pinned.load(Ordering::Relaxed)
                    {
                        let _ = window.hide();
                    }
                }
                _ => {}
            }
        })
        .manage(state)
        .setup(|app| {
            // 1. Tray — non-fatal
            if let Err(e) = setup_tray(app.handle()) {
                log_startup_error("tray", &e);
                #[cfg(not(debug_assertions))]
                let _ = app.dialog()
                    .message(format!("System tray icon failed to load:\n{e}\n\nThe app may not appear in the system tray."))
                    .title("Startup Warning")
                    .kind(tauri_plugin_dialog::MessageDialogKind::Warning)
                    .show(|_| {});
            }

            // 2. Global shortcut — non-fatal
            if let Err(e) = setup_shortcut(app.handle()) {
                log_startup_error("shortcut", &e);
            }

            // 3. Updater — non-fatal
            #[cfg(desktop)]
            if let Err(e) = app.handle().plugin(tauri_plugin_updater::Builder::new().build()) {
                log_startup_error("updater", &e);
            }

            // 4. Logging (debug only)
            if cfg!(debug_assertions) {
                let _ = app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                );
            }

            // 5. Window visibility: always show on first launch, otherwise respect silent_launch
            {
                let state = app.state::<AppState>();
                let guard = state.store.lock().ok();
                let is_first = !guard.as_ref().map(|s| s.settings.setup_completed).unwrap_or(false);
                let silent = guard.as_ref().map(|s| s.settings.silent_launch).unwrap_or(false);

                if is_first || !silent {
                    show_window_on_active_monitor(app.handle());
                    app.state::<AppState>().pinned.store(true, std::sync::atomic::Ordering::Relaxed);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hide_window,
            set_pinned,
            start_drag_pin,
            update_shortcut,
            commands::projects::list_projects,
            commands::projects::add_project,
            commands::projects::remove_project,
            commands::projects::update_project,
            commands::editors::launch_editor,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::templates::inject_template,
            commands::git::git_status,
            commands::git::git_pull,
            commands::git::git_push,
            commands::git::git_fetch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
