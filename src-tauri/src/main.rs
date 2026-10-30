// Evita la finestra console su Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri_convex_chat_lib::run()
}
