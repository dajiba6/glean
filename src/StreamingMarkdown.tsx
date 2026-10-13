import { useEffect, useRef } from "react";
import CherryStream from "cherry-markdown/dist/cherry-markdown.stream.esm.js";
import "cherry-markdown/dist/cherry-markdown.markdown.css";

type CherryPreview = {
  setMarkdown: (content: string) => void;
  destroy: () => void;
};

export default function StreamingMarkdown({ content }: { content: string }) {
  const host = useRef<HTMLDivElement>(null);
  const preview = useRef<CherryPreview | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const instance = new CherryStream({
      el,
      value: "",
      isPreviewOnly: true,
      engine: {
        global: {
          flowSessionContext: true,
          flowSessionCursor: "",
          htmlBlackList: "*",
        },
      },
    }) as CherryPreview;
    preview.current = instance;
    return () => {
      instance.destroy();
      preview.current = null;
    };
  }, []);

  useEffect(() => {
    preview.current?.setMarkdown(content);
  }, [content]);

  return <div ref={host} className="explanation-markdown" />;
}
