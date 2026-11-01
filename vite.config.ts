import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Solo per la build di test, che `pnpm e2e` compila con `--debug`: una release si ferma se ne trova una. */
const TEST_ONLY_VARS = ["VITE_E2E", "VITE_GIPHY_API_URL"];

// Porta fissa: Tauri si aspetta di trovare il dev server qui (vedi tauri.conf.json).
export default defineConfig(({ command, mode }) => {
  if (command === "build" && process.env.TAURI_ENV_DEBUG !== "true") {
    const env = loadEnv(mode, process.cwd(), "VITE_");
    const found = TEST_ONLY_VARS.filter((name) => name in env);
    if (found.length) throw new Error(`${found.join(", ")} belongs to the Test build alone, so this build stops`);
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    clearScreen: false,
    server: { port: 1420, strictPort: true },
    envPrefix: ["VITE_", "TAURI_ENV_*"],
    build: { target: "es2022", sourcemap: !!process.env.TAURI_ENV_DEBUG },
  };
});
