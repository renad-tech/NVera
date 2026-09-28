import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// The app always calls "/api" and "/models" on its own origin:
// - dev: Vite forwards them to the FastAPI backend (below)
// - production: FastAPI serves this built site itself, so it's the same origin anyway
const BACKEND = process.env.NVERA_BACKEND_URL ?? "http://localhost:8000";

// Vite config - https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Read VITE_* vars from the shared .env at the repo root.
  // Vite only exposes VITE_-prefixed vars to the browser, so API keys stay server-side.
  envDir: "..",
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": BACKEND,
      "/models": BACKEND,
    },
  },
});
