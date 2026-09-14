import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    target: "es2022",
    manifest: true,
    sourcemap: false,
  },
});
