import { defineConfig } from "vitest/config";

// Per quello che l'E2E non raggiunge. L'ambiente è quello che convex-test consiglia per le funzioni Convex.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "convex/**/*.test.ts"],
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
