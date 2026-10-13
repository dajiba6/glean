import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.js";
import type { Config } from "../server/config.js";
import { readSSE } from "../shared/stream.js";

const config: Config = {
  host: "127.0.0.1",
  port: 3000,
  llm: {
    baseUrl: "https://model.example/v1",
    apiKey: "private-test-key",
    model: "test-model",
    timeoutMs: 1000,
  },
};
async function withApp(
  fn: (url: string) => Promise<void>,
  model?: typeof fetch,
  settings = config,
) {
  const server = createApp(settings, model).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
const request = (url: string, body: unknown, signal?: AbortSignal) =>
  fetch(`${url}/glean/api/translate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
const sse = (value: string) =>
  new Response(value, { headers: { "content-type": "text/event-stream" } });

test("health does not call model or expose credentials; redirects preserve base and query; API 404 is JSON", async () => {
  await withApp(
    async (url) => {
      assert.deepEqual(await (await fetch(url + "/glean/api/health")).json(), {
        status: "ok",
        llmConfigured: true,
        translationTimeoutMs: 1000,
      });
      const redirect = await fetch(url + "/glean?hello=1", {
        redirect: "manual",
      });
      assert.equal(redirect.status, 308);
      assert.equal(redirect.headers.get("location"), "/glean/?hello=1");
      const missing = await fetch(url + "/glean/api/missing");
      assert.equal(missing.status, 404);
      assert.match(missing.headers.get("content-type")!, /json/);
    },
    async () => {
      throw new Error("Health must not call model");
    },
  );
});

test("only selected text enters user message; provider destination is fixed and secrets remain server-side", async () => {
  let calls = 0;
  const model: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(String(input), "https://model.example/v1/chat/completions");
    assert.equal(init?.redirect, "error");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer private-test-key",
    );
    const body = JSON.parse(init?.body as string);
    assert.equal(body.messages[1].content, "gentle");
    assert.equal(body.messages.length, 2);
    return sse(
      'data: {"choices":[{"delta":{"content":"Soft"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":" and calm."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    );
  };
  await withApp(async (url) => {
    const response = await request(url, {
      text: "gentle",
      language: "en",
      baseUrl: "http://127.0.0.1",
      context: "NEVER SEND THIS",
    });
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Soft/);
    assert.match(body, /"type":"done"/);
    assert.doesNotMatch(body, /private-test-key/);
    assert.equal(calls, 1);
  }, model);
});

test("invalid input, malformed JSON and missing config produce JSON errors", async () => {
  await withApp(
    async (url) => {
      assert.equal(
        (await request(url, { text: "", language: "en" })).status,
        400,
      );
      assert.equal(
        (await request(url, { text: "hello", language: "fr" })).status,
        400,
      );
      const bad = await fetch(url + "/glean/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });
      assert.equal(bad.status, 400);
      assert.match(bad.headers.get("content-type")!, /json/);
      const missing = await request(url, { text: "hello", language: "en" });
      assert.equal(missing.status, 503);
    },
    undefined,
    { ...config, llm: { ...config.llm, apiKey: "" } },
  );
});

test("upstream errors do not leak provider response or retry", async () => {
  let calls = 0;
  await withApp(
    async (url) => {
      const response = await request(url, { text: "hello", language: "en" });
      assert.equal(response.status, 502);
      assert.doesNotMatch(await response.text(), /private-test-key/);
      assert.equal(calls, 1);
    },
    async () => {
      calls++;
      return new Response("private-test-key", { status: 401 });
    },
  );
});

test("truncated stream is a failure rather than a successful partial answer", async () => {
  await withApp(
    async (url) => {
      const body = await (
        await request(url, { text: "hello", language: "en" })
      ).text();
      assert.match(body, /"type":"error"/);
      assert.doesNotMatch(body, /"type":"done"/);
    },
    async () => sse('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n'),
  );
});

test("timeout aborts provider request and ends with 504", async () => {
  let aborted = false;
  await withApp(
    async (url) => {
      const response = await request(url, { text: "hello", language: "en" });
      assert.equal(response.status, 504);
      assert.equal(aborted, true);
    },
    async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
      }),
    { ...config, llm: { ...config.llm, timeoutMs: 35 } },
  );
});

test("client disconnect aborts the in-flight provider request", async () => {
  let started!: () => void;
  let cancelled!: () => void;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  const cancel = new Promise<void>((resolve) => {
    cancelled = resolve;
  });
  await withApp(
    async (url) => {
      const controller = new AbortController();
      const pending = request(
        url,
        { text: "hello", language: "en" },
        controller.signal,
      ).catch(() => {});
      await start;
      controller.abort();
      await pending;
      await Promise.race([
        cancel,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Cancellation not propagated")),
            500,
          ),
        ),
      ]);
    },
    async (_input, init) =>
      new Promise((_resolve, reject) => {
        started();
        init?.signal?.addEventListener("abort", () => {
          cancelled();
          reject(new Error("aborted"));
        });
      }),
  );
});

test("SSE parser supports UTF-8 and CRLF split across chunks", async () => {
  const bytes = new TextEncoder().encode(
    ": heartbeat\r\ndata: 中文\r\ndata: second\r\n\r\ndata: [DONE]\n\n",
  );
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  const values: string[] = [];
  for await (const value of readSSE(body)) values.push(value);
  assert.deepEqual(values, ["中文\nsecond", "[DONE]"]);
});
