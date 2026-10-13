import express from "express";
import type { Config } from "./config.js";
import { isConfigured } from "./config.js";
import { explanationPrompt } from "./prompts.js";
import { readSSE } from "../shared/stream.js";

export function createApp(config: Config, fetchModel: typeof fetch = fetch) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.get(/^\/reader$/, (req, res) => {
    const query = req.originalUrl.includes("?")
      ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
      : "";
    res.redirect(308, `/reader/${query}`);
  });
  app.use("/reader/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/reader/api/health", (_req, res) =>
    res.json({
      status: "ok",
      llmConfigured: isConfigured(config),
      translationTimeoutMs: config.llm.timeoutMs,
    }),
  );
  app.use("/reader/api", express.json({ limit: "1mb" }));
  app.post("/reader/api/translate", async (req, res) => {
    const { text, language } = req.body || {};
    if (
      typeof text !== "string" ||
      !text.trim() ||
      !["en", "zh"].includes(language)
    ) {
      res.status(400).json({ error: "请选择文字，并指定 en 或 zh 解释语言。" });
      return;
    }
    if (!isConfigured(config)) {
      res.status(503).json({
        error: "模型尚未配置。请在服务器填写 config.local.json 后重启服务。",
      });
      return;
    }
    const abort = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, config.llm.timeoutMs);
    res.on("close", () => abort.abort());
    const send = (event: object) => {
      if (!res.destroyed) res.write(JSON.stringify(event) + "\n");
    };
    try {
      // Destination is operator-controlled only. Never accept an endpoint/key from the browser.
      const upstream = await fetchModel(
        `${config.llm.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          redirect: "error",
          signal: abort.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.llm.apiKey}`,
          },
          body: JSON.stringify({
            model: config.llm.model,
            stream: true,
            messages: [
              { role: "system", content: explanationPrompt(language) },
              { role: "user", content: text.trim() },
            ],
          }),
        },
      );
      if (!upstream.ok) {
        await upstream.body?.cancel();
        const message =
          upstream.status === 401 || upstream.status === 403
            ? "模型服务拒绝了密钥，请检查服务端配置。"
            : upstream.status === 429
              ? "模型服务暂时繁忙或额度不足，请稍后手动重试。"
              : `模型服务请求失败（${upstream.status}），请稍后重试。`;
        res.status(502).json({ error: message });
        return;
      }
      if (!upstream.body) throw new Error("Empty body");
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      let hasText = false;
      let completed = false;
      if (upstream.headers.get("content-type")?.includes("application/json")) {
        const body = await upstream.json();
        const content = body.choices?.[0]?.message?.content;
        if (typeof content === "string" && content.trim()) {
          send({ type: "delta", text: content });
          hasText = true;
        }
        completed = true;
      } else {
        for await (const data of readSSE(upstream.body)) {
          if (data === "[DONE]") {
            completed = true;
            break;
          }
          const chunk = JSON.parse(data);
          if (chunk.error) throw new Error("Provider stream error");
          const choice = chunk.choices?.[0];
          const content = choice?.delta?.content;
          if (typeof content === "string" && content) {
            send({ type: "delta", text: content });
            hasText = true;
          }
          if (
            choice?.finish_reason === "length" ||
            choice?.finish_reason === "content_filter"
          )
            throw new Error("Incomplete answer");
          if (choice?.finish_reason) completed = true;
        }
      }
      if (!completed || !hasText) throw new Error("Incomplete stream");
      send({ type: "done" });
      res.end();
    } catch {
      if (res.destroyed) return;
      const error = timedOut
        ? "解释超时，请重试。"
        : "模型连接中断或返回了不完整结果，请重试。";
      if (res.headersSent) {
        send({ type: "error", error });
        res.end();
      } else res.status(timedOut ? 504 : 502).json({ error });
    } finally {
      clearTimeout(timeout);
    }
  });
  app.use("/reader/api", (_req, res) =>
    res.status(404).json({ error: "接口不存在。" }),
  );
  app.use(((err: { type?: string }, _req, res, _next) => {
    res.status(err.type === "entity.too.large" ? 413 : 400).json({
      error:
        err.type === "entity.too.large"
          ? "请求内容过大。"
          : "请求不是有效的 JSON。",
    });
  }) as express.ErrorRequestHandler);
  return app;
}
