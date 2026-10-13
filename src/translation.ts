export type Language = "en" | "zh";

export async function translate(
  text: string,
  language: Language,
  signal: AbortSignal,
  onDelta: (text: string) => void,
) {
  const response = await fetch("/glean/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language }),
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "解释服务暂时不可用，请重试。");
  }
  if (!response.body) throw new Error("服务未返回内容，请重试。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneReceived = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "delta" && typeof event.text === "string")
          onDelta(event.text);
        else if (event.type === "error")
          throw new Error(event.error || "解释失败，请重试。");
        else if (event.type === "done") doneReceived = true;
      }
      if (doneReceived) return;
      if (done) break;
    }
    throw new Error("连接已中断，解释尚未完成，请重试。");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
