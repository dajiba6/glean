import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  FileText,
  FolderOpen,
  Languages,
  Leaf,
  LoaderCircle,
  MousePointer2,
  Upload,
} from "lucide-react";
import Explanation from "./Explanation";
import type { ReadingSelection } from "./selection";

const EpubReader = lazy(() => import("./readers/EpubReader"));
const PdfReader = lazy(() => import("./readers/PdfReader"));

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [selection, setSelection] = useState<ReadingSelection | null>(null);
  const [selectionId, setSelectionId] = useState(0);
  const [health, setHealth] = useState<
    "checking" | "ready" | "unconfigured" | "offline"
  >("checking");
  const [checkId, setCheckId] = useState(0);
  const [requestTimeoutMs, setRequestTimeoutMs] = useState(125000);
  const input = useRef<HTMLInputElement>(null);
  const cache = useRef(new Map<string, string>());
  const dragCount = useRef(0);
  const closeExplanation = useCallback(() => setSelection(null), []);
  const select = useCallback((value: ReadingSelection) => {
    setSelection(value);
    setSelectionId((id) => id + 1);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 5000);
    let alive = true;
    setHealth("checking");
    fetch("/reader/api/health", { signal: abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((body) => {
        if (alive) {
          setHealth(body.llmConfigured ? "ready" : "unconfigured");
          if (
            Number.isFinite(body.translationTimeoutMs) &&
            body.translationTimeoutMs >= 1000
          )
            setRequestTimeoutMs(body.translationTimeoutMs + 5000);
        }
      })
      .catch(() => {
        if (alive) setHealth("offline");
      })
      .finally(() => clearTimeout(timer));
    return () => {
      alive = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [checkId]);
  const openFile = (next?: File) => {
    if (!next) return;
    if (!/\.(epub|pdf)$/i.test(next.name)) {
      setError("请选择 EPUB 或 PDF 格式的文件。");
      return;
    }
    if (!next.size) {
      setError("这个文件是空的，请选择其他文件。");
      return;
    }
    setError("");
    setSelection(null);
    cache.current.clear();
    setFile(next);
    setFileId((value) => value + 1);
  };
  return (
    <div
      className={`app ${file ? "is-reading" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes("Files")) {
          dragCount.current++;
          setDragging(true);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        if (--dragCount.current <= 0) {
          setDragging(false);
          dragCount.current = 0;
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragCount.current = 0;
        setDragging(false);
        openFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        ref={input}
        className="file-input"
        type="file"
        accept=".epub,.pdf,application/pdf,application/epub+zip"
        aria-label="选择电子书"
        onChange={(event) => {
          openFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <header className="site-header">
        <button
          className="brand"
          onClick={() => {
            setFile(null);
            setSelection(null);
            cache.current.clear();
          }}
          aria-label="返回首页"
        >
          <span className="brand-icon">
            <BookOpen size={21} />
          </span>
          <span>
            Reader<span className="brand-dot">.</span>
          </span>
        </button>
        {file ? (
          <>
            <div className="book-title">
              <span className="format-tag">
                {file.name.split(".").pop()?.toUpperCase()}
              </span>
              <span title={file.name}>
                {file.name.replace(/\.(epub|pdf)$/i, "")}
              </span>
            </div>
            <button
              className="secondary"
              onClick={() => input.current?.click()}
            >
              <FolderOpen size={16} />
              更换书籍
            </button>
          </>
        ) : (
          <span className="header-note">
            <Leaf size={14} /> 给阅读留一点空间
          </span>
        )}
      </header>
      {file && health !== "ready" && health !== "checking" && (
        <div className="service-notice">
          {health === "unconfigured"
            ? "阅读已就绪。模型配置完成后，即可使用选词解释。"
            : "暂时无法连接解释服务，你仍可继续阅读。"}
          <button onClick={() => setCheckId((value) => value + 1)}>
            重新检查
          </button>
        </div>
      )}
      {error && (
        <div className="file-error" role="alert">
          {error}
          <button onClick={() => setError("")}>关闭</button>
        </div>
      )}
      {file ? (
        <Suspense
          fallback={
            <div className="reader-loading">
              <LoaderCircle className="spin" />
              正在准备阅读器…
            </div>
          }
        >
          {/\.epub$/i.test(file.name) ? (
            <EpubReader
              key={fileId}
              file={file}
              onSelect={select}
              onNavigate={closeExplanation}
            />
          ) : (
            <PdfReader
              key={fileId}
              file={file}
              onSelect={select}
              onNavigate={closeExplanation}
            />
          )}
        </Suspense>
      ) : (
        <main className="welcome">
          <section className="intro">
            <div className="eyebrow">
              <span /> A LITTLE HELP, A LOT MORE READING
            </div>
            <h1>
              让英文阅读，
              <br />
              少一点打断<span className="accent">。</span>
            </h1>
            <p>
              打开一本书，留在它的故事里。
              <br />
              遇到陌生的词句，用简单英文慢慢读懂。
            </p>
          </section>
          <section className="open-card">
            <div className="open-card-top">
              <div className="book-illustration">
                <BookOpen size={42} strokeWidth={1.2} />
                <span className="small-spark">✦</span>
              </div>
              <span className="card-index">01 / 开始阅读</span>
            </div>
            <h2>今天，读哪一本？</h2>
            <p>将电子书拖到这里，或从电脑中选择。</p>
            <button className="primary" onClick={() => input.current?.click()}>
              <Upload size={17} />
              选择一本书 <ArrowUpRight size={17} />
            </button>
            <div className="format-list">
              <span>EPUB</span>
              <span>PDF</span>
              <small>PDF 需包含可选择的文字</small>
            </div>
            <div className="local-note">
              <Check size={14} />
              文件仅在浏览器中打开，不上传整本书
            </div>
          </section>
          <section className="how-it-works">
            <div>
              <span className="step-icon">
                <MousePointer2 size={19} />
              </span>
              <h3>遇见一个生词</h3>
              <p>点一下单词，或划选一段文字。</p>
            </div>
            <div>
              <span className="step-icon">
                <BookOpen size={19} />
              </span>
              <h3>先用英文理解</h3>
              <p>用更简单的英文，解释眼前的文字。</p>
            </div>
            <div>
              <span className="step-icon">
                <Languages size={19} />
              </span>
              <h3>需要时，看看中文</h3>
              <p>点击「看不懂」，再多一点帮助。</p>
            </div>
          </section>
          <footer className="welcome-footer">
            <span>
              <FileText size={13} />
              临时阅读 · 不保存阅读记录
            </span>
            <span>仅选中文字会经服务器发送给配置的模型服务</span>
          </footer>
        </main>
      )}
      {selection && (
        <Explanation
          key={selectionId}
          selection={selection}
          cache={cache.current}
          onClose={closeExplanation}
          timeoutMs={requestTimeoutMs}
        />
      )}
      {dragging && (
        <div className="drop-overlay">
          <Upload size={36} />
          <strong>松开，打开这本书</strong>
          <span>EPUB 或 PDF</span>
        </div>
      )}
    </div>
  );
}
