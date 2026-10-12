import { useEffect, useRef, useState } from "react";
import ePub, { type Book, type Rendition, type NavItem } from "epubjs";
import { ChevronLeft, ChevronRight, List, LoaderCircle } from "lucide-react";
import { prepareEpub } from "../sanitize";
import { bindSelection } from "../selection";
import type { ReaderProps, TocItem } from "./types";

export default function EpubReader({
  file,
  onSelect,
  onNavigate,
}: ReaderProps) {
  const area = useRef<HTMLDivElement>(null);
  const rendition = useRef<Rendition | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [fontSize, setFontSize] = useState(20);
  const [width, setWidth] = useState(780);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [chapter, setChapter] = useState("");
  const [edges, setEdges] = useState({ start: true, end: false });
  const callbacks = useRef({ onSelect, onNavigate });
  callbacks.current = { onSelect, onNavigate };

  useEffect(() => {
    let alive = true;
    let book: Book | undefined;
    let observer: ResizeObserver | undefined;
    const cleanups: (() => void)[] = [];
    setLoading(true);
    setError("");
    setToc([]);
    const timer = setTimeout(() => {
      if (alive) {
        setLoading(false);
        setError("打开书籍超时，请重试或更换文件。");
      }
    }, 30000);
    (async () => {
      const bytes = await prepareEpub(file);
      if (!alive || !area.current) return;
      book = ePub();
      await book.open(bytes);
      await book.ready;
      if (!alive) return;
      const items: TocItem[] = [];
      const flatten = (entries: NavItem[], depth = 0) =>
        entries.forEach((entry) => {
          items.push({ label: entry.label.trim(), target: entry.href, depth });
          if (entry.subitems) flatten(entry.subitems, depth + 1);
        });
      flatten(book.navigation.toc);
      setToc(items);
      const view = book.renderTo(area.current, {
        width: "100%",
        height: "100%",
        flow: "paginated",
        spread: "none",
        allowScriptedContent: false,
      });
      rendition.current = view;
      view.hooks.content.register(
        (contents: { document: Document; window: Window }) => {
          const doc = contents.document;
          const frame = contents.window.frameElement as HTMLElement | null;
          cleanups.push(
            bindSelection(
              doc,
              doc.body,
              (s) => callbacks.current.onSelect(s),
              () => {
                const rect = frame?.getBoundingClientRect();
                return { x: rect?.left || 0, y: rect?.top || 0 };
              },
            ),
          );
          const key = (event: KeyboardEvent) => {
            if (event.key === "Escape") callbacks.current.onNavigate();
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              callbacks.current.onNavigate();
              void (
                event.key === "ArrowRight" ? view.next() : view.prev()
              ).catch(() => {
                if (alive) setError("翻页失败，请重试。");
              });
            }
          };
          doc.addEventListener("keydown", key);
          cleanups.push(() => doc.removeEventListener("keydown", key));
        },
      );
      view.themes.default({
        body: {
          color: "#292f2c",
          "font-family": 'Georgia, "Noto Serif", serif',
          "line-height": "1.85 !important",
          padding: "12px 14px !important",
        },
        p: { "line-height": "1.85 !important" },
        "::selection": { background: "#d9e7da" },
      });
      view.themes.fontSize("20px");
      view.on(
        "relocated",
        (location: {
          atStart: boolean;
          atEnd: boolean;
          start: { href: string };
        }) => {
          if (!alive) return;
          setEdges({ start: location.atStart, end: location.atEnd });
          setChapter(
            items.find(
              (item) =>
                item.target.split("#")[0] === location.start.href.split("#")[0],
            )?.label || "正文",
          );
        },
      );
      view.on("displayError", () => {
        if (alive) {
          setLoading(false);
          setError("章节无法显示，请重试或更换文件。");
        }
      });
      await view.display();
      if (!alive) return;
      observer = new ResizeObserver(() => {
        if (area.current)
          view.resize(area.current.clientWidth, area.current.clientHeight);
      });
      observer.observe(area.current);
      clearTimeout(timer);
      setLoading(false);
    })().catch((reason) => {
      clearTimeout(timer);
      if (alive) {
        setError(
          reason instanceof Error
            ? reason.message
            : "书籍无法打开，请检查文件。",
        );
        setLoading(false);
      }
    });
    return () => {
      alive = false;
      clearTimeout(timer);
      observer?.disconnect();
      cleanups.forEach((clean) => clean());
      rendition.current = null;
      book?.destroy();
    };
  }, [file, attempt]);

  const move = async (target: string) => {
    onNavigate();
    setShowToc(false);
    try {
      await rendition.current?.display(target);
    } catch {
      setError("章节无法显示，请重试。");
    }
  };
  const turn = async (next: boolean) => {
    onNavigate();
    try {
      await (next ? rendition.current?.next() : rendition.current?.prev());
    } catch {
      setError("翻页失败，请重试。");
    }
  };
  return (
    <div className="reader-layout">
      <div className="reading-toolbar">
        <button
          onClick={() => {
            onNavigate();
            setShowToc((value) => !value);
          }}
          aria-expanded={showToc}
        >
          <List size={17} />
          目录
        </button>
        <span className="toolbar-divider" />
        <label>
          字号{" "}
          <select
            aria-label="字号"
            value={fontSize}
            onChange={(event) => {
              const value = Number(event.target.value);
              setFontSize(value);
              rendition.current?.themes.fontSize(`${value}px`);
              onNavigate();
            }}
          >
            {[16, 18, 20, 22, 24, 28].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <label>
          宽度{" "}
          <select
            aria-label="阅读宽度"
            value={width}
            onChange={(event) => {
              setWidth(Number(event.target.value));
              onNavigate();
            }}
          >
            <option value={640}>窄</option>
            <option value={780}>适中</option>
            <option value={960}>宽</option>
          </select>
        </label>
        <span className="toolbar-hint">点一个词，或划选一句话</span>
      </div>
      <div className="book-stage">
        {showToc && (
          <aside className="toc">
            <h3>目录</h3>
            {toc.length ? (
              toc.map((item, index) => (
                <button
                  key={index}
                  style={{ paddingLeft: 16 + item.depth * 14 }}
                  onClick={() => void move(item.target)}
                >
                  {item.label}
                </button>
              ))
            ) : (
              <p>这本书没有目录。</p>
            )}
          </aside>
        )}
        <div className="epub-paper" style={{ maxWidth: width }}>
          <div className="epub-content" ref={area} />
          {loading && !error && (
            <div className="stage-message">
              <LoaderCircle className="spin" />
              正在打开书籍…
            </div>
          )}
          {error && (
            <div className="stage-message error-state" role="alert">
              <p>{error}</p>
              <button
                onClick={() => {
                  setFontSize(20);
                  setAttempt((value) => value + 1);
                }}
              >
                重新打开
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="reading-footer">
        <span className="chapter-name">{chapter || "EPUB"}</span>
        <div className="page-controls">
          <button
            aria-label="上一页"
            disabled={loading || edges.start}
            onClick={() => void turn(false)}
          >
            <ChevronLeft size={18} />
          </button>
          <span>翻页阅读</span>
          <button
            aria-label="下一页"
            disabled={loading || edges.end}
            onClick={() => void turn(true)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <span className="footer-note">阅读位置仅保留在本次打开期间</span>
      </div>
    </div>
  );
}
