import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react";
import type { ReadingSelection } from "./selection";
import StreamingMarkdown from "./StreamingMarkdown";
import { translate, type Language } from "./translation";

export default function Explanation({
  selection,
  cache,
  closing,
  onClose,
  onExited,
  timeoutMs,
}: {
  selection: ReadingSelection;
  cache: Map<string, string>;
  closing: boolean;
  onClose: () => void;
  onExited: () => void;
  timeoutMs: number;
}) {
  const [language, setLanguage] = useState<Language>("en");
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
    if (closing) return;
    const onPointerDown = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && panel.current?.contains(target)) return;
      onClose();
    };
    const docs = new Set<Document>();
    const bind = (doc: Document | null) => {
      if (!doc || docs.has(doc)) return;
      docs.add(doc);
      doc.addEventListener("pointerdown", onPointerDown, true);
    };
    const scan = () => {
      bind(document);
      document.querySelectorAll(".epub-content iframe").forEach((frame) => {
        bind((frame as HTMLIFrameElement).contentDocument);
      });
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      docs.forEach((doc) => doc.removeEventListener("pointerdown", onPointerDown, true));
    };
  }, [closing, onClose]);

  useEffect(() => {
    if (!closing) return;
    const node = panel.current;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onExited();
    };
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.target === node) finish();
    };
    node?.addEventListener("animationend", onAnimationEnd);
    const timer = window.setTimeout(finish, 220);
    return () => {
      node?.removeEventListener("animationend", onAnimationEnd);
      window.clearTimeout(timer);
    };
  }, [closing, onExited]);

  useEffect(() => {
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
  }, [language, retry, selection.text, cache]);

  return (
    <div
      ref={panel}
      className={`explanation${closing ? " is-leaving" : ""}`}
      role="dialog"
      aria-label="文字解释"
      style={position}
    >
      <div className="explanation-heading">
        <button className="icon-button" aria-label="关闭解释" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="explanation-body">
        <div className="selected-text" title={selection.text}>
          {selection.text}
        </div>
        {answer ? (
          <StreamingMarkdown content={answer} />
        ) : loading ? (
          <div className="explanation-loading" aria-label="正在解释">
            <LoaderCircle className="spin" size={22} />
          </div>
        ) : null}
        {error && (
          <div className="inline-error" role="alert">
            {error}
            <button onClick={() => setRetry((value) => value + 1)}>
              <RotateCcw size={14} />
              重试
            </button>
          </div>
        )}
      </div>
      <div className="explanation-footer">
        {language === "zh" ? (
          <button onClick={() => setLanguage("en")}>
            <ArrowLeft size={14} />
            返回原文语言解释
          </button>
        ) : (
          <button onClick={() => setLanguage("zh")}>
            看不懂，看看中文 <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
