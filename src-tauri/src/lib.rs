mod windows_audio;
mod google_oauth;

use std::sync::Mutex;
use tauri::{menu::{Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}, Emitter, Manager, State, WindowEvent};
use windows_audio::CaptureSession;

#[derive(Default)]
struct AppState {
    capture: Mutex<Option<CaptureSession>>,
}

#[derive(serde::Serialize)]
struct CaptureSnapshot {
    audio: String,
    start_seconds: f64,
    duration_seconds: f64,
}

#[tauri::command]
fn start_capture(state: State<'_, AppState>) -> Result<(), String> {
    let mut active = state.capture.lock().map_err(|_| "No se pudo acceder al estado de captura.".to_string())?;
    if active.is_some() {
        return Err("Ya hay una captura activa.".into());
    }
    *active = Some(windows_audio::start()?);
    Ok(())
}

#[tauri::command]
fn stop_capture(state: State<'_, AppState>) -> Result<String, String> {
    let session = state.capture.lock().map_err(|_| "No se pudo acceder al estado de captura.".to_string())?
        .take().ok_or_else(|| "No hay una captura activa.".to_string())?;
    let wav = session.finish()?;
    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(wav))
}

#[tauri::command]
fn snapshot_capture(state: State<'_, AppState>) -> Result<CaptureSnapshot, String> {
    let active = state.capture.lock().map_err(|_| "No se pudo acceder al estado de captura.".to_string())?;
    let session = active.as_ref().ok_or_else(|| "No hay una captura activa.".to_string())?;
    let (wav, start_seconds, duration_seconds) = session.snapshot(14)?;
    use base64::Engine;
    Ok(CaptureSnapshot { audio: base64::engine::general_purpose::STANDARD.encode(wav), start_seconds, duration_seconds })
}

#[tauri::command]
async fn begin_google_calendar_auth(client_id: String) -> Result<google_oauth::OAuthCallback, String> {
    tauri::async_runtime::spawn_blocking(move || google_oauth::authorize(client_id))
        .await.map_err(|error| format!("Falló la autorización de Google: {error}"))?
}

#[tauri::command]
fn store_calendar_refresh_token(token: String) -> Result<(), String> {
    google_oauth::store_refresh_token(&token)
}

#[tauri::command]
fn load_calendar_refresh_token() -> Result<Option<String>, String> {
    google_oauth::load_refresh_token()
}

#[tauri::command]
fn clear_calendar_refresh_token() -> Result<(), String> {
    google_oauth::clear_refresh_token()
}

#[tauri::command]
fn store_calendar_client_secret(secret: String) -> Result<(), String> {
    google_oauth::store_client_secret(&secret)
}

#[tauri::command]
fn load_calendar_client_secret() -> Result<Option<String>, String> {
    google_oauth::load_client_secret()
}

#[tauri::command]
fn clear_calendar_client_secret() -> Result<(), String> {
    google_oauth::clear_client_secret()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(AppState { capture: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![start_capture, stop_capture, snapshot_capture, begin_google_calendar_auth, store_calendar_refresh_token, load_calendar_refresh_token, clear_calendar_refresh_token, store_calendar_client_secret, load_calendar_client_secret, clear_calendar_client_secret])
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Abrir LocalGhost", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Salir de LocalGhost", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;
            TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("LocalGhost · captura local")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main_window(app),
                    "quit" => {
                        let capture_active = app.state::<AppState>().capture.lock().map(|capture| capture.is_some()).unwrap_or(true);
                        if capture_active {
                            show_main_window(app);
                            let _ = app.emit("ghost-exit-blocked", ());
                        } else {
                            app.exit(0);
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(event, TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. }) {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running LocalGhost");
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
