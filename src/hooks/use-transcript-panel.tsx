import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export const TRANSCRIPT_MIN = 300;
export const TRANSCRIPT_MAX = 760;
const DEFAULT_WIDTH = 440;
const STORAGE_KEY = "chat:transcript-width";

const clamp = (w: number) => Math.min(TRANSCRIPT_MAX, Math.max(TRANSCRIPT_MIN, Math.round(w)));

function loadWidth(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(n) && n > 0 ? clamp(n) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

export interface TranscriptContent {
  body: string;
  source: string | null;
}

interface Value {
  content: TranscriptContent | null;
  width: number;
  open: (content: TranscriptContent) => void;
  close: () => void;
  setWidth: (width: number) => void;
}

const Ctx = createContext<Value | null>(null);

/** Pannello laterale con una trascrizione aperta; la larghezza scelta resta salvata su questo computer. */
export function TranscriptPanelProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<TranscriptContent | null>(null);
  const [width, setWidthState] = useState(loadWidth);

  const setWidth = useCallback((w: number) => {
    const next = clamp(w);
    setWidthState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // vale solo per questa sessione
    }
  }, []);
  const open = useCallback((c: TranscriptContent) => setContent(c), []);
  const close = useCallback(() => setContent(null), []);

  const value = useMemo(() => ({ content, width, open, close, setWidth }), [content, width, open, close, setWidth]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** null fuori dal provider (ad esempio nelle finestre staccate): lì il pulsante "Vedi in sidebar" non c'è. */
export const useTranscriptPanel = () => useContext(Ctx);
