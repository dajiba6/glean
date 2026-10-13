import { useEffect, useRef, useState, type CSSProperties } from "react";
import ePub, { type Book, type Rendition, type NavItem, type Contents } from "epubjs";
import { ChevronDown, ChevronLeft, ChevronRight, FolderOpen, List, LoaderCircle, Minus, Plus } from "lucide-react";
import { prepareEpub } from "../sanitize";
import { bindSelection } from "../selection";
import type { ReaderProps, TocItem } from "./types";

const WIDTHS = [
  { value: 640, label: "窄" },
  { value: 780, label: "适中" },
  { value: 960, label: "宽" },
  { value: 0, label: "铺满" },
];

function splitTarget(target: string) {
  const hash = target.indexOf("#");
  const path = hash >= 0 ? target.slice(0, hash) : target;
  const id = hash >= 0 ? decodeURIComponent(target.slice(hash + 1)) : "";
  return { path, id };
}

function sameSpineFile(sectionHref: string, targetPath: string) {
  const clean = (value: string) =>
    decodeURIComponent(value).split("?")[0].replace(/\\/g, "/").replace(/^\.\//, "");
  const section = clean(sectionHref);
  let target = clean(targetPath);
  while (target.startsWith("../")) target = target.slice(3);
  return section === target || section.endsWith(`/${target}`) || target.endsWith(`/${section}`);
}

function currentSectionIndex(view: Rendition, scroller: HTMLElement, items: TocItem[]) {
  const contents = view.getContents() as unknown as Array<{
    sectionIndex: number;
    document: Document;
    window: Window;
  }>;
  const list = Array.isArray(contents) ? contents : [];
  const limit = scroller.getBoundingClientRect().top + 48;
  let current = -1;
  items.forEach((item, index) => {
    const top = anchorTop(view, list, item.target);
    if (top != null && top <= limit) current = index;
  });
  return current;
}

function anchorTop(
  view: Rendition,
  list: Array<{ sectionIndex: number; document: Document; window: Window }>,
  target: string,
) {
  const { path, id } = splitTarget(target);
  for (const content of list) {
    const section = view.book.spine.get(content.sectionIndex);
    if (!section?.href || !sameSpineFile(section.href, path)) continue;
    const frame = content.window.frameElement;
    if (!(frame instanceof HTMLElement)) continue;
    const node = id ? content.document.getElementById(id) : content.document.body;
    if (!node) continue;
    return frame.getBoundingClientRect().top + node.getBoundingClientRect().top;
  }
  return null;
}

export default function EpubReader({
  file,
  onSelect,
  onNavigate,
  onChangeBook,
}: ReaderProps) {
  const area = useRef<HTMLDivElement>(null);
  const rendition = useRef<Rendition | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const tocRef = useRef<TocItem[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [fontSize, setFontSize] = useState(20);
  const [width, setWidth] = useState(780);
  const [widthOpen, setWidthOpen] = useState(false);
  const widthPicker = useRef<HTMLSpanElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [chapter, setChapter] = useState("");
  const [edges, setEdges] = useState({ start: true, end: false });
  const callbacks = useRef({ onSelect, onNavigate });
  callbacks.current = { onSelect, onNavigate };

  useEffect(() => {
    rendition.current?.themes.fontSize(`${fontSize}px`);
  }, [fontSize]);

  useEffect(() => {
    if (!widthOpen) return;
    const close = (event: PointerEvent) => {
      if (!widthPicker.current?.contains(event.target as Node)) setWidthOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWidthOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [widthOpen]);

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
      tocRef.current = items;
      setToc(items);
      const view = book.renderTo(area.current, {
        width: "100%",
        height: "100%",
        manager: "continuous",
        flow: "scrolled-continuous",
        overflow: "auto",
        spread: "none",
        allowScriptedContent: false,
      });
      rendition.current = view;
      view.hooks.content.register(
        (contents: Contents) => {
          const doc = contents.document;
          if (!doc.getElementById("reader-scrollbar")) {
            const style = doc.createElement("style");
            style.id = "reader-scrollbar";
            style.textContent =
              "html,body{scrollbar-width:thin;scrollbar-color:#c5ccb8 transparent}::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}::-webkit-scrollbar-thumb{background:#c5ccb8;border-radius:99px}";
            doc.head.appendChild(style);
          }
          // epub.js measures a text Range, which can omit the bottom of a
          // cover/SVG and the body's padding. Keep its pagination measurements
          // in sync with the full chapter box, with one viewport for short chapters.
          const textHeight = contents.textHeight.bind(contents);
          contents.textHeight = () => Math.ceil(Math.max(
            textHeight(),
            doc.body.getBoundingClientRect().bottom,
            (area.current?.clientHeight ?? 0) - 48,
          ));
          contents.emit("resize");
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
              turnPage(event.key === "ArrowRight");
            }
          };
          doc.addEventListener("keydown", key);
          cleanups.push(() => doc.removeEventListener("keydown", key));
          const wheel = (event: WheelEvent) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            callbacks.current.onNavigate();
            setFontSize((value) => Math.max(10, Math.min(40, value + (event.deltaY < 0 ? 2 : -2))));
          };
          doc.addEventListener("wheel", wheel, { passive: false });
          cleanups.push(() => doc.removeEventListener("wheel", wheel));
        },
      );
      view.themes.default({
        html: { width: "100% !important", height: "auto !important" },
        body: {
          width: "100% !important",
          height: "auto !important",
          "min-height": "0 !important",
          "box-sizing": "border-box !important",
          background: "#fffefb",
          color: "#292f2c",
          "font-family": 'Georgia, "Noto Serif", serif',
          "line-height": "1.85 !important",
          padding: "40px 72px !important",
        },
        p: { "line-height": "1.85 !important" },
        img: { "max-width": "100% !important", height: "auto !important" },
        svg: { "max-width": "100% !important" },
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
          if (!alive || !area.current) return;
          const index = currentSectionIndex(view, area.current, items);
          if (items.length) {
            setEdges({ start: index <= 0, end: index >= items.length - 1 });
            setChapter(items[index >= 0 ? index : 0]?.label || "正文");
          } else {
            setEdges({ start: location.atStart, end: location.atEnd });
            setChapter("正文");
          }
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
  const turnPage = (next: boolean) => {
    const scroller = area.current?.querySelector(".epub-container");
    const view = rendition.current;
    const items = tocRef.current;
    if (!(scroller instanceof HTMLElement) || !view) return;
    if (!items.length) {
      scroller.scrollTop += (next ? 1 : -1) * scroller.clientHeight;
      return;
    }
    const current = currentSectionIndex(view, scroller, items);
    const target = items[next ? current + 1 : current - 1];
    if (!target) return;
    void view.display(target.target).catch(() => setError("翻页失败，请重试。"));
  };
  const turn = (next: boolean) => {
    onNavigate();
    turnPage(next);
  };
  return (
    <div className="reader-layout">
      <div
        className="reading-toolbar"
        onMouseLeave={(event) => {
          if (!showToc) return;
          const next = event.relatedTarget;
          if (next instanceof Element && next.closest(".toc-drawer")) return;
          setShowToc(false);
        }}
      >
        <button
          data-toc-toggle
          onClick={() => {
            onNavigate();
            setShowToc((value) => !value);
          }}
          aria-expanded={showToc}
        >
          <List size={17} />
          目录
        </button>
        <span className="font-controls">
          <span className="control-label">字体</span>
          <span className="font-stepper">
            <button aria-label="缩小" disabled={fontSize <= 10} onClick={() => {
              onNavigate();
              setFontSize((value) => Math.max(10, value - 2));
            }}><Minus size={16} /></button>
            <span className="zoom-label">{fontSize * 5}%</span>
            <button aria-label="放大" disabled={fontSize >= 40} onClick={() => {
              onNavigate();
              setFontSize((value) => Math.min(40, value + 2));
            }}><Plus size={16} /></button>
          </span>
        </span>
        <span className="width-control">
          <span className="control-label">宽度</span>
          <span className="width-picker" ref={widthPicker}>
            <button
              aria-label="阅读宽度"
              aria-haspopup="listbox"
              aria-expanded={widthOpen}
              onClick={() => {
                onNavigate();
                setWidthOpen((open) => !open);
              }}
            >
              {WIDTHS.find((item) => item.value === width)?.label}
              <ChevronDown size={14} />
            </button>
            {widthOpen && (
              <div className="width-menu" role="listbox" aria-label="阅读宽度">
                {WIDTHS.map((item) => (
                  <button
                    key={item.value}
                    role="option"
                    aria-selected={item.value === width}
                    onClick={() => {
                      setWidth(item.value);
                      setWidthOpen(false);
                      onNavigate();
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </span>
        </span>
        <button className="change-book" onClick={onChangeBook}>
          <FolderOpen size={16} />
          更换书籍
        </button>
      </div>
      <div className="book-stage epub-stage">
        <div
          className={`toc-drawer ${showToc ? "is-open" : ""}`}
          onMouseLeave={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Element && next.closest(".reading-toolbar")) return;
            setShowToc(false);
          }}
        >
          <aside className="toc" inert={!showToc}>
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
        </div>
        <div className="epub-paper" style={{ "--epub-page-width": width ? `${width}px` : "100%" } as CSSProperties}>
          <div className="epub-content" ref={area} onScrollCapture={() => callbacks.current.onNavigate()} />
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
        <div className="page-controls epub-turn">
          <button
            aria-label="上一页"
            disabled={loading || edges.start}
            onClick={() => turn(false)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            aria-label="下一页"
            disabled={loading || edges.end}
            onClick={() => turn(true)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <span className="footer-hint">双击解释单词，划选解释句子</span>
      </div>
    </div>
  );
}
