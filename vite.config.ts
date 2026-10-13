import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfRoot = dirname(require.resolve("pdfjs-dist/package.json"));

export default defineConfig({
  base: "/glean/",
  plugins: [
    react(),
    {
      name: "local-pdf-resources",
      closeBundle() {
        mkdirSync("dist/client/pdf-assets", { recursive: true });
        for (const name of ["cmaps", "standard_fonts", "wasm", "iccs"])
          cpSync(
            resolve(pdfRoot, name),
            resolve("dist/client/pdf-assets", name),
            { recursive: true },
          );
      },
    },
  ],
  build: { outDir: "dist/client" },
  server: { host: "127.0.0.1" },
});
