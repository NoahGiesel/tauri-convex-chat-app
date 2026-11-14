import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { servePhoto } from "./geoPhoto";

const http = httpRouter();

// Espone le rotte di Better Auth (/api/auth/*) con CORS per il frontend Tauri.
authComponent.registerRoutes(http, createAuth, { cors: true });

// La foto di un Round del Geo Duel, senza dire quale posto sia.
http.route({ path: "/geo/photo", method: "GET", handler: servePhoto });

export default http;
