import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs let the same build run at a domain root or at
  // https://<user>.github.io/<repo>/ on GitHub Pages.
  base: "./",
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ["@relate/relate-wasm"],
  },
  build: {
    target: "esnext",
  },
});
