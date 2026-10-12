import type { ReadingSelection } from "../selection";
export interface ReaderProps {
  file: File;
  onSelect: (selection: ReadingSelection) => void;
  onNavigate: () => void;
}
export type TocItem = { label: string; target: string; depth: number };
