import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  ChevronLeft,
  ChevronRight,
  List,
  LoaderCircle,
  Minus,
  Plus,
  FolderOpen,
} from "lucide-react";
import { bindSelection } from "../selection";
import type { ReaderProps } from "./types";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
const options = {
  cMapUrl: "/glean/pdf-assets/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/glean/pdf-assets/standard_fonts/",
  wasmUrl: "/glean/pdf-assets/wasm/",
  iccUrl: "/glean/pdf-assets/iccs/",
  isEvalSupported: false,
};
type PdfDocument = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
type PdfOutline = Awaited<ReturnType<PdfDocument["getOutline"]>>;

export default function PdfReader({ file, onSelect, onNavigate, onChangeBook }: ReaderProps) {
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const currentPage = useRef(page);
  currentPage.current = page;
  const [zoom, setZoom] = useState(1);
  const [outline, setOutline] = useState<PdfOutline>([]);
  const [showToc, setShowToc] = useState(false);
  const [error, setError] = useState("");
  const [noText, setNoText] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pageInput, setPageInput] = useState("1");
  const doc = useRef<PdfDocument | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState(760);
  const callbacks = useRef({ onSelect, onNavigate });
  callbacks.current = { onSelect, onNavigate };
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setFitWidth(
        Math.min(820, Math.max(280, entries[0].contentRect.width - 80)),
      ),
    );
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!root.current) return;
    return bindSelection(document, root.current, (selection) =>
      callbacks.current.onSelect(selection),
    );
  }, []);
  useEffect(() => {
    setPageInput(String(page));
    setNoText(false);
    stage.current?.scrollTo(0, 0);
  }, [page]);
  const go = (value: number) => {
    onNavigate();
    setPage(Math.max(1, Math.min(pages, value)));
  };
  const jump = async (dest: unknown) => {
    try {
      if (!doc.current) return;
      const destination =
        typeof dest === "string"
          ? await doc.current.getDestination(dest)
          : dest;
      if (!Array.isArray(destination) || !destination.length) return;
      const index =
        typeof destination[0] === "number"
          ? destination[0]
          : await doc.current.getPageIndex(destination[0]);
      go(index + 1);
      setShowToc(false);
    } catch {
      setError("无法跳转到此目录，请使用页码翻页。");
    }
  };
  const renderOutline = (items: PdfOutline, depth = 0): React.ReactNode =>
    items?.map((item, index) => (
      <div key={index}>
        <button
          disabled={!item.dest}
          style={{ paddingLeft: 16 + depth * 14 }}
          onClick={() => void jump(item.dest)}
        >
          {item.title}
        </button>
        {renderOutline(item.items, depth + 1)}
      </div>
    ));
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
        <button
          aria-label="缩小"
          disabled={zoom <= 0.5}
          onClick={() => {
            onNavigate();
            setZoom((value) => Math.max(0.5, value - 0.1));
          }}
        >
          <Minus size={16} />
        </button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <button
          aria-label="放大"
          disabled={zoom >= 2}
          onClick={() => {
            onNavigate();
            setZoom((value) => Math.min(2, value + 0.1));
          }}
        >
          <Plus size={16} />
        </button>
        <button
          onClick={() => {
            onNavigate();
            setZoom(1);
          }}
        >
          适合宽度
        </button>
        <button className="change-book" onClick={onChangeBook}>
          <FolderOpen size={16} />
          更换书籍
        </button>
      </div>
      <div
        className="book-stage pdf-stage"
        ref={stage}
        onScroll={() => onNavigate()}
      >
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
            {outline?.length ? (
              renderOutline(outline)
            ) : (
              <p>这本书没有目录，请使用页码跳转。</p>
            )}
          </aside>
        </div>
        {error && (
          <div className="pdf-error" role="alert">
            {error}
            <button
              onClick={() => {
                setError("");
                setAttempt((value) => value + 1);
              }}
            >
              重新打开
            </button>
          </div>
        )}
        <div
          ref={root}
          className="pdf-paper"
          style={{ width: fitWidth * zoom }}
        >
          <Document
            key={attempt}
            file={file}
            options={options}
            suspense={false}
            onLoadSuccess={async (pdf) => {
              doc.current = pdf;
              setPages(pdf.numPages);
              setError("");
              setOutline(await pdf.getOutline().catch(() => []));
            }}
            onLoadError={() => setError("PDF 无法打开，请检查文件是否损坏。")}
            onSourceError={() => setError("无法读取这个文件，请重新选择。")}
            onPassword={() =>
              setError("第一版暂不支持需要密码的 PDF，请先解锁文件。")
            }
            loading={
              <div className="pdf-loading">
                <LoaderCircle className="spin" />
                正在打开 PDF…
              </div>
            }
            error={<div className="pdf-loading">无法显示 PDF</div>}
          >
            <Page
              pageNumber={page}
              width={fitWidth * zoom}
              renderTextLayer
              renderAnnotationLayer={false}
              onLoadSuccess={(pdfPage) => {
                const pageNumber = pdfPage.pageNumber;
                void pdfPage
                  .getTextContent()
                  .then((text) => {
                    if (pageNumber === currentPage.current)
                      setNoText(
                        !text.items.some(
                          (item) => "str" in item && item.str.trim(),
                        ),
                      );
                  })
                  .catch(() => {
                    if (pageNumber === currentPage.current)
                      setError("无法读取此页文字，请重试。");
                  });
              }}
              onLoadError={() => setError("页面加载失败，请重试。")}
              onRenderError={() => setError("页面绘制失败，请重试。")}
              onRenderTextLayerError={() =>
                setError("文字层加载失败，暂时无法选词，请重试。")
              }
              loading={
                <div className="pdf-loading">
                  <LoaderCircle className="spin" />
                  正在显示页面…
                </div>
              }
            />
          </Document>
        </div>
      </div>
      {noText && (
        <div className="scan-notice">
          这一页没有可选择的文字，可能是扫描页。第一版暂不支持 OCR 识别。
        </div>
      )}
      <div className="reading-footer">
        <span>PDF · 保留原版式</span>
        <div className="page-controls">
          <button
            aria-label="上一页"
            disabled={page <= 1}
            onClick={() => go(page - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = Number(pageInput);
              if (Number.isInteger(value) && value > 0) go(value);
              else setPageInput(String(page));
            }}
          >
            <input
              aria-label="页码"
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
            />
            <span>/ {pages || "—"}</span>
          </form>
          <button
            aria-label="下一页"
            disabled={!pages || page >= pages}
            onClick={() => go(page + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <span className="footer-hint">双击解释单词，划选解释句子</span>
      </div>
    </div>
  );
}
