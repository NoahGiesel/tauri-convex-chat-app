// La build di test si compila sempre con `--debug`: così nessuna strada porta il server WebDriver in una release.
#[cfg(all(feature = "e2e", not(debug_assertions)))]
compile_error!("the e2e feature is for the Test build alone, which pnpm e2e builds with --debug");

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init());

    // Server WebDriver senza autenticazione: solo nella build di test, mai in una release.
    #[cfg(feature = "e2e")]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio dell'applicazione");
}
