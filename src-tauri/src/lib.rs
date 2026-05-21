mod store;
mod commands;

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
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

fn setup_shortcut(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);

    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, _shortcut, _event| {
                show_window_on_active_monitor(app);
            })
            .build(),
    )?;

    app.global_shortcut().register(shortcut)?;
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
            setup_tray(app.handle())?;
            setup_shortcut(app.handle())?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hide_window,
            set_pinned,
            start_drag_pin,
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
