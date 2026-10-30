import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// Espone le rotte di Better Auth (/api/auth/*) con CORS per il frontend Tauri.
authComponent.registerRoutes(http, createAuth, { cors: true });

export default http;
