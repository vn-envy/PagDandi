import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    proxy: {
      // Local LLM endpoint (LiteRT-LM serve / Ollama) — proxied so the browser
      // talks same-origin with no CORS setup on the model server.
      "/llm": {
        target: process.env.LLM_ENDPOINT ?? "http://127.0.0.1:11434",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/llm/, ""),
      },
      // Humsafar presence relay (local hotspot WebSocket, see server/relay.mjs)
      "/relay": {
        target: "ws://127.0.0.1:8790",
        ws: true,
        rewrite: (p) => p.replace(/^\/relay/, ""),
      },
    },
  },
});
