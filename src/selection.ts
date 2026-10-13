export type ReadingSelection = {
  text: string;
  kind: "word" | "passage";
  x: number;
  y: number;
};

/** Attach to either the PDF text layer or an EPUB chapter document. */
export function bindSelection(
  doc: Document,
  root: HTMLElement,
  onSelect: (selection: ReadingSelection) => void,
  offset: () => { x: number; y: number } = () => ({ x: 0, y: 0 }),
) {
  let start: { x: number; y: number } | null = null;
  let timer: ReturnType<typeof setTimeout>;
  const pickWord = (e: MouseEvent) => {
    if ((e.target as Element)?.closest?.("a,button,input,select,textarea")) return;
    const selection = doc.getSelection();
    const shift = offset();
    const caretDoc = doc as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const caret = caretDoc.caretPositionFromPoint?.(e.clientX, e.clientY);
    const fallback = caret
      ? null
      : caretDoc.caretRangeFromPoint?.(e.clientX, e.clientY);
    const node = caret?.offsetNode || fallback?.startContainer;
    const index = caret?.offset ?? fallback?.startOffset ?? 0;
    if (!node || node.nodeType !== 3 || !root.contains(node)) return;
    const segments = new Intl.Segmenter("en", {
      granularity: "word",
    }).segment(node.textContent || "");
    for (const segment of segments) {
      if (
        !segment.isWordLike ||
        index < segment.index ||
        index > segment.index + segment.segment.length
      )
        continue;
      const range = doc.createRange();
      range.setStart(node, segment.index);
      range.setEnd(node, segment.index + segment.segment.length);
      const rect = range.getBoundingClientRect();
      if (
        e.clientX < rect.left - 2 ||
        e.clientX > rect.right + 2 ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      )
        return;
      selection?.removeAllRanges();
      selection?.addRange(range);
      onSelect({
        text: segment.segment,
        kind: "word",
        x: rect.left + shift.x,
        y: rect.bottom + shift.y,
      });
      break;
    }
  };
  const down = (e: PointerEvent) => {
    if (e.button === 0) start = { x: e.clientX, y: e.clientY };
  };
  const up = (e: PointerEvent) => {
    if (!start || e.button !== 0) return;
    const dragged = Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4;
    start = null;
    if (!dragged) return;
    if ((e.target as Element)?.closest?.("a,button,input,select,textarea"))
      return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const selection = doc.getSelection();
      const shift = offset();
      const text = selection?.toString().trim();
      if (
        !text ||
        !selection?.rangeCount ||
        !root.contains(selection.anchorNode) ||
        !root.contains(selection.focusNode)
      )
        return;
      const rects = selection.getRangeAt(0).getClientRects();
      const rect = rects[rects.length - 1];
      onSelect({
        text,
        kind: "passage",
        x: (rect?.left ?? e.clientX) + shift.x,
        y: (rect?.bottom ?? e.clientY) + shift.y,
      });
    }, 0);
  };
  root.addEventListener("pointerdown", down);
  root.addEventListener("pointerup", up);
  root.addEventListener("dblclick", pickWord);
  return () => {
    clearTimeout(timer);
    root.removeEventListener("pointerdown", down);
    root.removeEventListener("pointerup", up);
    root.removeEventListener("dblclick", pickWord);
  };
}
