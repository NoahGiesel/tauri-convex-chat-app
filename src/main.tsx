import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { UpdaterProvider } from "@/hooks/use-updater";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UpdaterProvider>
      <App />
    </UpdaterProvider>
  </StrictMode>,
);
