import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tms/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Backend on :4000. Proxying keeps requests origin-relative so no CORS
      // configuration is needed in development.
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
  build: {
    // Vite 8 bundles with Rolldown, which code-splits vendor chunks well by
    // default. Doc 10's splitting requirement is met at the route level with
    // React.lazy rather than by hand-tuning chunks here.
    chunkSizeWarningLimit: 700,
  },
});
