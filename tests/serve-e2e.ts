import express from "express";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const model = express();
model.use(express.json());
const requests: unknown[] = [];
model.get("/requests", (_req, res) => res.json(requests));
model.post("/v1/chat/completions", (req, res) => {
  requests.push(req.body);
  const chinese = req.body.messages[0].content.includes("仅用简明中文");
  const text = chinese
    ? "轻柔的；温和的。"
    : "Soft and calm; not rough or strong.";
  res.setHeader("Content-Type", "text/event-stream");
  res.write(
    `data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(0, 8) } }] })}\n\n`,
  );
  const timer = setTimeout(() => {
    res.write(
      `data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(8) }, finish_reason: "stop" }] })}\n\n`,
    );
    res.end("data: [DONE]\n\n");
  }, 100);
  res.on("close", () => clearTimeout(timer));
});
const mock = model.listen(43138, "127.0.0.1", () => {
  const child = spawn(process.execPath, ["dist/server/server/index.js"], {
    stdio: "inherit",
    env: {
      ...process.env,
      READER_CONFIG: resolve("config.example.json"),
      PORT: "43137",
      HOST: "127.0.0.1",
      LLM_API_KEY: "e2e-only-fake-key",
      LLM_MODEL: "fixture",
      LLM_BASE_URL: "http://127.0.0.1:43138/v1",
    },
  });
  const stop = () => {
    child.kill("SIGTERM");
    mock.close();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  child.on("exit", (code) => {
    mock.close();
    process.exit(code || 0);
  });
});
