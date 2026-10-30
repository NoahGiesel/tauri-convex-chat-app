pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio dell'applicazione");
}
