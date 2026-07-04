import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// PagDandi is a PWA-style single-page app. It must run fully offline once the
// Trek Pack (map + trail + intelligence) is loaded, so we keep the build simple
// and self-contained with no runtime CDN dependencies.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
