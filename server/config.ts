import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export interface Config {
  host: string;
  port: number;
  llm: { baseUrl: string; model: string; apiKey: string; timeoutMs: number };
}

export function loadConfig(): Config {
  const path = resolve(process.env.READER_CONFIG || "config.local.json");
  let file: Partial<Config> = {};
  if (existsSync(path)) {
    try {
      file = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      throw new Error("配置文件不是有效的 JSON，请检查 config.local.json。");
    }
  } else if (process.env.READER_CONFIG) {
    throw new Error("READER_CONFIG 指定的配置文件不存在。");
  }
  const config: Config = {
    host: process.env.HOST || file.host || "127.0.0.1",
    port: Number(process.env.PORT || file.port || 3000),
    llm: {
      baseUrl:
        process.env.LLM_BASE_URL ||
        file.llm?.baseUrl ||
        "https://api.openai.com/v1",
      model: process.env.LLM_MODEL || file.llm?.model || "",
      apiKey: process.env.LLM_API_KEY || file.llm?.apiKey || "",
      timeoutMs: Number(
        process.env.LLM_TIMEOUT_MS || file.llm?.timeoutMs || 60000,
      ),
    },
  };
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535)
    throw new Error("服务端口必须是 1–65535 的整数。");
  if (!Number.isFinite(config.llm.timeoutMs) || config.llm.timeoutMs < 1000)
    throw new Error("模型超时必须不少于 1000 毫秒。");
  if (
    typeof config.llm.apiKey !== "string" ||
    typeof config.llm.model !== "string"
  )
    throw new Error("模型名称和密钥必须是字符串。");
  try {
    const url = new URL(config.llm.baseUrl);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new Error(
      "模型 baseUrl 必须是有效的 HTTP(S) 地址，不含凭据、查询参数或片段。",
    );
  }
  return config;
}

export function isConfigured(config: Config) {
  return Boolean(
    config.llm.apiKey &&
      config.llm.model &&
      config.llm.apiKey !== "YOUR_API_KEY" &&
      config.llm.model !== "YOUR_MODEL_NAME",
  );
}
