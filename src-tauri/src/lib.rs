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

    builder
        .invoke_handler(tauri::generate_handler![ping, relaunch_app])
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio dell'applicazione");
}
