import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import type { ReadingSelection } from "./selection";
import { translate, type Language } from "./translation";

export default function Explanation({
  selection,
  cache,
  onClose,
  timeoutMs,
}: {
  selection: ReadingSelection;
  cache: Map<string, string>;
  onClose: () => void;
  timeoutMs: number;
}) {
  const [language, setLanguage] = useState<Language>("en");
  const [started, setStarted] = useState(selection.kind === "word");
  const [retry, setRetry] = useState(0);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const timeout = useRef(timeoutMs);
  timeout.current = timeoutMs;
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({
    left: selection.x,
    top: selection.y + 10,
  });

  useLayoutEffect(() => {
    const place = () => {
      const rect = panel.current?.getBoundingClientRect();
      const width = rect?.width || 360;
      const height = rect?.height || 100;
      setPosition({
        left: Math.max(
          16,
          Math.min(selection.x, window.innerWidth - width - 16),
        ),
        top: Math.max(
          16,
          selection.y + height + 20 < window.innerHeight
            ? selection.y + 10
            : Math.min(
                selection.y - height - 26,
                window.innerHeight - height - 16,
              ),
        ),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [selection]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onClose]);

  useEffect(() => {
    if (!started) return;
    const key = `${language}:${selection.text}`;
    const cached = cache.get(key);
    setError("");
    setAnswer(cached || "");
    if (cached) {
      setLoading(false);
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    // Browser watchdog also covers an unreachable/stalled reader server.
    const timer = setTimeout(() => abort.abort("timeout"), timeout.current);
    let alive = true;
    let output = "";
    setLoading(true);
    translate(selection.text, language, abort.signal, (delta) => {
      if (alive) {
        output += delta;
        setAnswer(output);
      }
    })
      .then(() => {
        if (alive) cache.set(key, output);
      })
      .catch((reason) => {
        if (!alive) return;
        setError(
          abort.signal.aborted
            ? abort.signal.reason === "timeout"
              ? "连接超时，请重试。"
              : "已停止生成，可以重新解释。"
            : reason instanceof TypeError || reason instanceof SyntaxError
              ? "连接失败或响应无效，请检查网络后重试。"
              : reason instanceof Error
                ? reason.message
                : "连接失败，请检查网络后重试。",
        );
      })
      .finally(() => {
        clearTimeout(timer);
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [started, language, retry, selection.text, cache]);

  return (
    <div
      ref={panel}
      className="explanation"
      role="dialog"
      aria-label="文字解释"
      style={position}
    >
      <div className="explanation-heading">
        <span>
          {started
            ? language === "en"
              ? "IN SIMPLE ENGLISH"
              : "中文解释"
            : "选中文字"}
        </span>
        <button className="icon-button" aria-label="关闭解释" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="selected-text" title={selection.text}>
        {selection.text}
      </div>
      {!started ? (
        <button
          className="primary explain-trigger"
          onClick={() => setStarted(true)}
        >
          解释这段文字 <ArrowRight size={16} />
        </button>
      ) : (
        <>
          <div className="answer" aria-live="polite">
            {answer ||
              (loading ? (
                <span className="muted">正在组织简单的解释…</span>
              ) : null)}
          </div>
          {error && (
            <div className="inline-error" role="alert">
              {error}
              <button onClick={() => setRetry((value) => value + 1)}>
                <RotateCcw size={14} />
                重试
              </button>
            </div>
          )}
          <div className="explanation-footer">
            {language === "zh" ? (
              <button onClick={() => setLanguage("en")}>
                <ArrowLeft size={14} />
                返回英文
              </button>
            ) : (
              <button onClick={() => setLanguage("zh")}>
                看不懂，看看中文 <ArrowRight size={14} />
              </button>
            )}
            {loading && (
              <button
                className="stop"
                aria-label="停止生成"
                onClick={() => controller.current?.abort()}
              >
                <LoaderCircle className="spin" size={13} />
                <Square size={11} />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
