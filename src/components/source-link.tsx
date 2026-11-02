import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy } from "lucide-react";
import { useI18n } from "@/i18n/i18n-provider";
import { openLink } from "@/lib/links";

/** Link di una fonte: al passaggio del mouse mostra l'indirizzo completo con un bottone per copiarlo. */
export function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  const { t } = useI18n();
  const ref = useRef<HTMLAnchorElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function show() {
    window.clearTimeout(timer.current);
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const below = r.top < 110; // poco spazio sopra: il popup va sotto
    setPos({ x: Math.min(Math.max(r.left, 12), window.innerWidth - 332), y: below ? r.bottom : r.top, below });
  }
  function hideSoon() {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setPos(null);
      setCopied(false);
    }, 150);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
    } catch {
      // appunti non disponibili
    }
  }

  return (
    <>
      <a
        ref={ref}
        href={href}
        rel="noreferrer noopener"
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void openLink(href);
        }}
        className="text-app-accent-text underline underline-offset-2 hover:opacity-80"
      >
        {children}
      </a>
      {pos &&
        createPortal(
          <div
            onMouseEnter={show}
            onMouseLeave={hideSoon}
            style={{ left: pos.x, top: pos.y, transform: pos.below ? "translateY(6px)" : "translateY(calc(-100% - 6px))" }}
            className="fixed z-50 flex w-80 items-start gap-2 rounded-xl border border-app-border-strong bg-app-panel p-2.5 shadow-lg"
          >
            <div className="min-w-0 flex-1 text-[12px] leading-snug break-all text-app-text-muted">{href}</div>
            <button
              type="button"
              onClick={() => void copy()}
              title={copied ? t("chat.linkCopied") : t("chat.copyLink")}
              aria-label={t("chat.copyLink")}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-app-field text-app-text hover:text-app-accent-text"
            >
              {copied ? <Check className="size-4" strokeWidth={2.2} /> : <Copy className="size-4" strokeWidth={2} />}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
