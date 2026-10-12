import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import express from "express";
import { createApp } from "./app.js";
import { loadConfig, isConfigured } from "./config.js";

const config = loadConfig();
const app = createApp(config);
const production = process.argv[1]?.endsWith(".js");
// Blob chapter documents inherit this policy. EPUB iframes also disallow scripts.
app.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self'${production ? "" : " 'unsafe-inline'"}`,
      "style-src 'self' 'unsafe-inline' blob:",
      "img-src 'self' blob: data:",
      "font-src 'self' blob: data:",
      `connect-src 'self' blob:${production ? "" : " ws: wss:"}`,
      "frame-src 'self' blob:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'self'",
    ].join("; "),
  );
  next();
});
if (production) {
  const root = resolve("dist/client");
  app.use("/reader", express.static(root, { index: false }));
  app.get(/^\/reader\/(?!assets\/|pdf-assets\/).*/, (req, res, next) => {
    if (!req.accepts("html") || /\.[a-z0-9]+$/i.test(req.path)) {
      next();
      return;
    }
    res.sendFile(resolve(root, "index.html"));
  });
} else {
  const require = createRequire(import.meta.url);
  const pdfRoot = dirname(require.resolve("pdfjs-dist/package.json"));
  for (const name of ["cmaps", "standard_fonts", "wasm", "iccs"])
    app.use(
      `/reader/pdf-assets/${name}`,
      express.static(resolve(pdfRoot, name)),
    );
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
  });
  app.use((req, res, next) => {
    const originalUrl = req.url;
    vite.middlewares(req, res, (error: unknown) => {
      req.url = originalUrl;
      next(error);
    });
  });
  app.get(/^\/reader\/.*/, async (req, res, next) => {
    try {
      const html = await vite.transformIndexHtml(
        req.originalUrl,
        await readFile("index.html", "utf8"),
      );
      res.type("html").send(html);
    } catch (error) {
      next(error);
    }
  });
}
app.use((_req, res) => res.status(404).type("text").send("Not found"));
const server = app.listen(config.port, config.host, () => {
  console.log(`Reader: http://${config.host}:${config.port}/reader/`);
  console.log(
    isConfigured(config)
      ? "模型配置已加载。"
      : "模型尚未配置；可以先打开本地书籍。",
  );
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close();
    server.closeAllConnections();
    process.exit(0);
  });
}
