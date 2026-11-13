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
    use tauri::image::Image;
    use tauri::{AppHandle, Manager, Window, WindowEvent, Wry};

    /// Voci del menu, tenute per poterne cambiare il testo quando cambia la lingua, e le due versioni dell'icona.
    pub struct Items {
        open: MenuItem<Wry>,
        quit: MenuItem<Wry>,
        icon: Option<Image<'static>>,
        unread_icon: Option<Image<'static>>,
    }

    /// L'icona con un bollino rosso senza numero in basso a destra, per i messaggi non letti.
    fn with_unread_dot(icon: &Image<'_>) -> Image<'static> {
        let (w, h) = (icon.width(), icon.height());
        let mut rgba = icon.rgba().to_vec();
        let r = w.min(h) as f32 * 0.24;
        let (cx, cy) = (w as f32 - r - 0.5, h as f32 - r - 0.5);
        const RED: [f32; 3] = [242.0, 63.0, 67.0];
        for y in 0..h {
            for x in 0..w {
                let d = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
                // Bordo sfumato di un pixel.
                let a = (r - d + 0.5).clamp(0.0, 1.0);
                if a == 0.0 {
                    continue;
                }
                let i = ((y * w + x) * 4) as usize;
                for c in 0..3 {
                    rgba[i + c] = (RED[c] * a + rgba[i + c] as f32 * (1.0 - a)).round() as u8;
                }
                rgba[i + 3] = (255.0 * a + rgba[i + 3] as f32 * (1.0 - a)).round() as u8;
            }
        }
        Image::new_owned(rgba, w, h)
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
        let icon = app.default_window_icon().map(|icon| icon.clone().to_owned());
        let unread_icon = icon.as_ref().map(with_unread_dot);
        if let Some(icon) = &icon {
            tray = tray.icon(icon.clone());
        }
        tray.build(app)?;

        app.manage(Items { open, quit, icon, unread_icon });
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

    pub fn set_unread(app: &AppHandle, unread: bool) {
        let (Some(items), Some(tray)) = (app.try_state::<Items>(), app.tray_by_id("main")) else { return };
        let icon = if unread { &items.unread_icon } else { &items.icon };
        let _ = tray.set_icon(icon.clone());
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

/// Bollino rosso sull'icona nell'area di notifica se ci sono messaggi non letti. Fuori da Windows non fa nulla.
#[tauri::command]
fn set_tray_unread(app: tauri::AppHandle, unread: bool) {
    #[cfg(target_os = "windows")]
    tray::set_unread(&app, unread);
    #[cfg(not(target_os = "windows"))]
    let _ = (app, unread);
}

/// 16 byte stabili ricavati dal nome dell'istanza di test (`E2E_INSTANCE`): su macOS è ciò che separa i dati delle due app.
/// Solo nella build di test su macOS; altrove non c'è nulla da separare.
#[cfg(all(feature = "e2e", target_os = "macos"))]
fn e2e_store_id() -> Option<[u8; 16]> {
    let name = std::env::var("E2E_INSTANCE").ok().filter(|n| !n.is_empty())?;
    // FNV-1a a 64 bit con due partenze diverse: bastano a dare a ogni nome un identificatore diverso.
    let fnv = |seed: u64| name.bytes().fold(seed, |h, b| (h ^ b as u64).wrapping_mul(0x0000_0100_0000_01b3));
    let (a, b) = (fnv(0xcbf2_9ce4_8422_2325), fnv(0x84222325_cbf29ce4));
    let mut id = [0u8; 16];
    id[..8].copy_from_slice(&a.to_be_bytes());
    id[8..].copy_from_slice(&b.to_be_bytes());
    Some(id)
}

/// Apre una finestra staccata con l'identificatore dei dati di questa istanza, così resta nella stessa sessione.
/// Solo la build di test su macOS; altrove risponde con un errore e il frontend usa la strada normale.
#[tauri::command]
async fn e2e_create_popout(app: tauri::AppHandle, label: String, url: String, title: String) -> Result<(), String> {
    #[cfg(all(feature = "e2e", target_os = "macos"))]
    {
        let id = e2e_store_id().ok_or("E2E_INSTANCE is not set")?;
        tauri::WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::App(url.into()))
            .title(title)
            .inner_size(720.0, 720.0)
            .min_inner_size(420.0, 360.0)
            .disable_drag_drop_handler()
            .data_store_identifier(id)
            .build()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(all(feature = "e2e", target_os = "macos")))]
    {
        let _ = (app, label, url, title);
        Err("only the macOS Test build opens windows this way".into())
    }
}

/// Argomento con cui il sistema avvia l'app all'accesso: è salvato insieme alla voce di avvio automatico.
const AUTOSTART_ARG: &str = "--autostart";

/// Vero se è il sistema ad aver avviato l'app all'accesso, non l'utente. `args` sono gli argomenti senza il nome del programma.
fn launched_at_login(mut args: impl Iterator<Item = String>) -> bool {
    args.any(|arg| arg == AUTOSTART_ARG)
}

pub fn run() {
    #[cfg(target_os = "macos")]
    let _ = BUNDLE_PATH.set(bundle_path_at_launch());

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init());

    // Avvio all'accesso, spento finché l'utente non lo accende dalle Preferenze: il plugin non registra nulla da solo.
    #[cfg(desktop)]
    let builder = {
        let autostart = tauri_plugin_autostart::Builder::new().arg(AUTOSTART_ARG);
        #[cfg(target_os = "macos")]
        let autostart = autostart.macos_launcher(tauri_plugin_autostart::MacosLauncher::LaunchAgent);
        builder.plugin(autostart.build())
    };

    // Server WebDriver senza autenticazione: solo nella build di test, mai in una release.
    #[cfg(feature = "e2e")]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());

    // Un solo `setup`: un secondo prenderebbe il posto del primo.
    let builder = builder.setup(|app| {
        use tauri::Manager as _;
        #[cfg(target_os = "windows")]
        tray::create(app)?;
        // Build di test su macOS: niente cartella dati per istanza, quindi la finestra principale (creata qui e non dalla
        // configurazione, che la lascia con `create: false`) riceve un identificatore dei dati diverso per ogni istanza.
        #[cfg(all(feature = "e2e", target_os = "macos"))]
        {
            let id = e2e_store_id().ok_or("E2E_INSTANCE is not set: the Test build needs a name for its data")?;
            for config in app.config().app.windows.iter().filter(|w| !w.create) {
                // Each instance is shifted a little: a window completely covered by the other counts as hidden, and the app
                // then stops its presence heartbeat, so the friend would show as offline.
                let shift: f64 = std::env::var("E2E_OFFSET").ok().and_then(|v| v.parse().ok()).unwrap_or(0.0);
                tauri::WebviewWindowBuilder::from_config(app, config)?
                    .data_store_identifier(id)
                    .position(40.0 + shift, 60.0 + shift)
                    .build()?;
            }
        }
        // La finestra principale nasce nascosta (tauri.conf.json) e si mostra qui, così non lampeggia quando deve restare nascosta:
        // su Windows, avviata all'accesso, l'app resta nell'area di notifica.
        let stay_in_tray = cfg!(target_os = "windows") && launched_at_login(std::env::args().skip(1));
        if !stay_in_tray {
            if let Some(window) = app.get_webview_window("main") {
                window.show()?;
            }
        }
        Ok(())
    });

    #[cfg(target_os = "windows")]
    let builder = builder.on_window_event(tray::on_window_event);

    builder
        .invoke_handler(tauri::generate_handler![ping, relaunch_app, set_tray_labels, set_tray_unread, e2e_create_popout])
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio dell'applicazione");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> impl Iterator<Item = String> {
        list.iter().map(|a| a.to_string()).collect::<Vec<_>>().into_iter()
    }

    #[test]
    fn a_launch_at_login_is_recognised() {
        assert!(launched_at_login(args(&["--autostart"])));
    }

    #[test]
    fn a_launch_by_the_user_is_not_a_launch_at_login() {
        assert!(!launched_at_login(args(&[])));
        assert!(!launched_at_login(args(&["--something-else"])));
    }
}
