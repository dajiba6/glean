import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  BookOpen,
  Languages,
  LoaderCircle,
  MousePointer2,
  Upload,
} from "lucide-react";
import Explanation from "./Explanation";
import AuroraBackground from "./AuroraBackground";
import { PixelBook, PixelWordmark } from "./PixelBrand";
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
  const [closing, setClosing] = useState(false);
  const [health, setHealth] = useState<
    "checking" | "ready" | "unconfigured" | "offline"
  >("checking");
  const [checkId, setCheckId] = useState(0);
  const [requestTimeoutMs, setRequestTimeoutMs] = useState(125000);
  const input = useRef<HTMLInputElement>(null);
  const cache = useRef(new Map<string, string>());
  const dragCount = useRef(0);
  const selectionRef = useRef<ReadingSelection | null>(null);
  selectionRef.current = selection;
  const closeExplanation = useCallback(() => {
    if (selectionRef.current) setClosing(true);
  }, []);
  const finishClose = useCallback(() => {
    setSelection(null);
    setClosing(false);
  }, []);
  const select = useCallback((value: ReadingSelection) => {
    setClosing(false);
    setSelection(value);
    setSelectionId((id) => id + 1);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 5000);
    let alive = true;
    setHealth("checking");
    fetch("/glean/api/health", { signal: abort.signal })
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
      {!file && (
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
              <PixelBook />
            </span>
            <PixelWordmark />
          </button>
        </header>
      )}
      {file && health === "offline" && (
        <div className="service-notice">
          暂时无法连接解释服务，你仍可继续阅读。
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
              onChangeBook={() => input.current?.click()}
            />
          ) : (
            <PdfReader
              key={fileId}
              file={file}
              onSelect={select}
              onNavigate={closeExplanation}
              onChangeBook={() => input.current?.click()}
            />
          )}
        </Suspense>
      ) : (
        <main className="welcome">
          <div className="welcome-panel welcome-hero">
          <section className="intro">
            <h1>
              跨过语言壁垒，
              <br />
              看见更广阔的世界
            </h1>
            <p>
              <strong>在原文环境中，读懂你想读懂的作品。</strong>
              遇到不懂的词句，先用同一种语言去理解它。还是无法理解，才进入中文。
            </p>
          </section>
          <section className="open-card">
            <AuroraBackground />
            <button className="primary" onClick={() => input.current?.click()}>
              <Upload size={17} />
              开始阅读
            </button>
            <div className="format-list">
              <span>EPUB</span>
              <span>PDF</span>
            </div>
          </section>
          <section className="how-it-works">
            <div>
              <span className="step-icon">
                <MousePointer2 size={19} />
              </span>
              <h3>遇见卡住的地方</h3>
              <p>双击一个单词，或划选一段文字。</p>
            </div>
            <div>
              <span className="step-icon">
                <BookOpen size={19} />
              </span>
              <h3>在原文语言里理解</h3>
              <p>用这本书的语言，把意思说得更简单。</p>
            </div>
            <div>
              <span className="step-icon">
                <Languages size={19} />
              </span>
              <h3>需要时，看看中文</h3>
              <p>点击「看不懂」，再多一点帮助。</p>
            </div>
          </section>
          </div>
          <div className="welcome-panel">
          <section className="reading-features" aria-labelledby="features-title">
            <div className="section-intro">
              <span className="section-eyebrow">从兴趣出发，留在原文里</span>
              <h2 id="features-title">让解释，也成为语言输入</h2>
              <p>你想读的那本书，可能还稍微有点难。Glean 帮你解开眼前的词句，让阅读继续。</p>
            </div>
            <div className="feature-grid">
              <article>
                <span className="feature-number">01</span>
                <h3>读你真正想读的原著</h3>
                <p>打开自己的 EPUB 或 PDF，从小说、随笔或感兴趣的非虚构作品开始。保留原著的内容，让好奇心带你翻到下一页。</p>
              </article>
              <article>
                <span className="feature-number">02</span>
                <h3>卡住的地方，就地解开</h3>
                <p>双击生词，或划选一段文字，在阅读页里查看解释。理解这一处，再接着读下去。</p>
              </article>
              <article>
                <span className="feature-number">03</span>
                <h3>跟着原文的语言走</h3>
                <p>让解释成为原文阅读的一部分，中文留作需要时的帮助。</p>
              </article>
            </div>
          </section>
          </div>
          <div className="welcome-panel">
          <section className="learning-theory" aria-labelledby="theory-title">
            <div className="section-intro">
              <span className="section-eyebrow">设计背后的语言学习理念</span>
              <h2 id="theory-title">为什么先用原文的语言解释？</h2>
              <p>Glean 的设计受到语言学家 Stephen Krashen 的第二语言习得理论启发：在感兴趣的阅读中，接触更多能够理解的原文。</p>
            </div>
            <div className="theory-list">
              <article>
                <div><span>可理解输入假说</span><h3>理解，是语言习得的起点</h3></div>
                <p>这一假说认为，人通过理解包含略高于现有水平的语言内容来发展语言能力。Glean 用同一种语言里更简单的词句解释难点，帮助你读懂眼前的原文，让解释本身也成为语言输入。</p>
              </article>
              <article>
                <div><span>习得与学习假说</span><h3>在理解意思的过程中，熟悉语言</h3></div>
                <p>Krashen 区分了在有意义的交流中自然习得语言，与有意识地学习语言规则。Glean 鼓励你把注意力放在故事、观点和表达上，先通过原文语言理解，中文作为需要时的辅助。</p>
              </article>
              <article>
                <div><span>情感过滤假说</span><h3>少一点焦虑，多一点阅读的意愿</h3></div>
                <p>这一假说强调动机、自信和焦虑对语言习得的影响。自己选择感兴趣的原著，卡住时随时获得帮助，是 Glean 希望降低阅读压力、支持持续阅读的方式。</p>
              </article>
            </div>
          </section>
          </div>
        </main>
      )}
      {selection && (
        <Explanation
          key={selectionId}
          selection={selection}
          cache={cache.current}
          closing={closing}
          onClose={closeExplanation}
          onExited={finishClose}
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
