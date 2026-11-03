// La build di test si compila sempre con `--debug`: così nessuna strada porta il server WebDriver in una release.
#[cfg(all(feature = "e2e", not(debug_assertions)))]
compile_error!("the e2e feature is for the Test build alone, which pnpm e2e builds with --debug");

use std::net::{SocketAddr, TcpStream};
use std::time::{Duration, Instant};

/// Latenza di rete in millisecondi: tempo di handshake TCP verso Cloudflare. Host e porta sono fissi (nessun input dal frontend).
/// `None` se nessuno dei due indirizzi risponde entro il timeout.
#[tauri::command]
async fn ping() -> Option<u32> {
    tauri::async_runtime::spawn_blocking(|| {
        const HOSTS: [&str; 2] = ["1.1.1.1:443", "1.0.0.1:443"];
        for host in HOSTS {
            let Ok(addr) = host.parse::<SocketAddr>() else { continue };
            let start = Instant::now();
            if TcpStream::connect_timeout(&addr, Duration::from_millis(2000)).is_ok() {
                return Some(start.elapsed().as_millis() as u32);
            }
        }
        None
    })
    .await
    .ok()
    .flatten()
}

/// Percorso del bundle `.app` da cui l'app è stata avviata, letto subito all'avvio (dopo un aggiornamento l'eseguibile in corso può essere stato spostato).
#[cfg(target_os = "macos")]
static BUNDLE_PATH: std::sync::OnceLock<Option<std::path::PathBuf>> = std::sync::OnceLock::new();

#[cfg(target_os = "macos")]
fn bundle_path_at_launch() -> Option<std::path::PathBuf> {
    // .../Chat.app/Contents/MacOS/chat -> .../Chat.app
    let app = std::env::current_exe().ok()?.ancestors().nth(3)?.to_path_buf();
    (app.extension()? == "app").then_some(app)
}

/// Riavvio dopo un aggiornamento. Su macOS riapre lo stesso `.app` da cui era partita, una volta chiuso il processo attuale,
/// così il Dock mostra una sola icona; altrove è il riavvio normale.
#[tauri::command]
fn relaunch_app(app: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let pid = std::process::id();
        let target = match BUNDLE_PATH.get().cloned().flatten() {
            Some(path) => format!("/usr/bin/open '{}'", path.display().to_string().replace('\'', "'\\''")),
            None => format!("/usr/bin/open -b '{}'", app.config().identifier),
        };
        let script = format!("while kill -0 {pid} 2>/dev/null; do sleep 0.2; done; {target}");
        let _ = std::process::Command::new("/bin/sh").arg("-c").arg(script).spawn();
        app.exit(0);
    }
    #[cfg(not(target_os = "macos"))]
    app.restart();
}

/// Icona nell'area di notifica di Windows: la X della finestra principale la nasconde lì invece di chiudere l'app,
/// così le notifiche continuano ad arrivare. Si esce dal menu dell'icona.
#[cfg(target_os = "windows")]
mod tray {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    use tauri::{AppHandle, Manager, Window, WindowEvent, Wry};

    /// Voci del menu, tenute per poterne cambiare il testo quando cambia la lingua.
    pub struct Items {
        open: MenuItem<Wry>,
        quit: MenuItem<Wry>,
    }

    fn show_main(app: &AppHandle) {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }

    pub fn create(app: &tauri::App) -> tauri::Result<()> {
        // Testi in inglese finché il frontend non manda quelli della lingua scelta.
        let open = MenuItem::with_id(app, "open", "Open Chat", true, None::<&str>)?;
        let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&open, &quit])?;

        let mut tray = TrayIconBuilder::with_id("main")
            .tooltip("Chat")
            .menu(&menu)
            .show_menu_on_left_click(false)
            .on_menu_event(|app, event| match event.id.as_ref() {
                "open" => show_main(app),
                "quit" => app.exit(0),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                    show_main(tray.app_handle());
                }
            });
        if let Some(icon) = app.default_window_icon() {
            tray = tray.icon(icon.clone());
        }
        tray.build(app)?;

        app.manage(Items { open, quit });
        Ok(())
    }

    /// La X (e Alt+F4) sulla finestra principale la nasconde invece di chiuderla. Le finestre staccate si chiudono come sempre.
    pub fn on_window_event(window: &Window, event: &WindowEvent) {
        if let WindowEvent::CloseRequested { api, .. } = event {
            if window.label() == "main" {
                api.prevent_close();
                let _ = window.hide();
            }
        }
    }

    pub fn set_labels(app: &AppHandle, open: &str, quit: &str) {
        if let Some(items) = app.try_state::<Items>() {
            let _ = items.open.set_text(open);
            let _ = items.quit.set_text(quit);
        }
    }
}

/// Testi del menu dell'icona nell'area di notifica, nella lingua scelta nell'app. Fuori da Windows non fa nulla.
#[tauri::command]
fn set_tray_labels(app: tauri::AppHandle, open: String, quit: String) {
    #[cfg(target_os = "windows")]
    tray::set_labels(&app, &open, &quit);
    #[cfg(not(target_os = "windows"))]
    let _ = (app, open, quit);
}

pub fn run() {
    #[cfg(target_os = "macos")]
    let _ = BUNDLE_PATH.set(bundle_path_at_launch());

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init());

    // Server WebDriver senza autenticazione: solo nella build di test, mai in una release.
    #[cfg(feature = "e2e")]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());

    #[cfg(target_os = "windows")]
    let builder = builder
        .setup(|app| {
            tray::create(app)?;
            Ok(())
        })
        .on_window_event(tray::on_window_event);

    builder
        .invoke_handler(tauri::generate_handler![ping, relaunch_app, set_tray_labels])
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio dell'applicazione");
}
