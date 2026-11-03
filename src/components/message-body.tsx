import { useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/i18n-provider";
import { SourceLink } from "@/components/source-link";
import { openLink, splitLinks } from "@/lib/links";
import { cn } from "@/lib/utils";

export type MessageStyle = "me" | "code" | "pre" | "spoiler" | "quote" | "random" | "flip" | null | undefined;

/** Stili che l'autore può modificare dopo l'invio (il risultato di /random e /flip no). */
export const isEditableStyle = (style: MessageStyle) => style !== "random" && style !== "flip";

interface Props {
  style: MessageStyle;
  body: string;
  authorName: string;
  edited: boolean;
  className?: string;
}

/** Testo con i link cliccabili (si aprono nel browser di sistema). */
export function Linkified({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((part, i) =>
        part.type === "text" ? (
          part.text
        ) : (
          <a
            key={i}
            href={part.href}
            rel="noreferrer noopener"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void openLink(part.href);
            }}
            className="text-app-accent-text underline underline-offset-2 hover:opacity-80"
          >
            {part.text}
          </a>
        ),
      )}
    </>
  );
}

/** Il testo di un messaggio, formattato secondo il comando con cui è stato scritto. */
const COLLAPSE_AFTER = 1500;
const COLLAPSED_LENGTH = 1000;

/** Come MessageBody, ma i testi molto lunghi si mostrano accorciati, con "Mostra tutto". */
export function MessageBody(props: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const long = props.body.length > COLLAPSE_AFTER;
  if (!long) return <MessageBodyContent {...props} />;
  return (
    <>
      <MessageBodyContent {...props} body={expanded ? props.body : `${props.body.slice(0, COLLAPSED_LENGTH).trimEnd()}…`} />
      <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 text-[13px] font-semibold text-app-accent-text hover:underline">
        {expanded ? t("chat.showLess") : t("chat.showMore")}
      </button>
    </>
  );
}

/** Grassetto, corsivo e link dentro una riga di testo (markdown minimo). */
function Inline({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let rest = text;
  let key = 0;
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/;
  for (;;) {
    const m = re.exec(rest);
    if (!m) break;
    if (m.index > 0) nodes.push(<Linkified key={key++} text={rest.slice(0, m.index)} />);
    if (m[2] !== undefined) {
      nodes.push(<SourceLink key={key++} href={m[2]}>{m[1]}</SourceLink>);
    } else {
      nodes.push(m[3] !== undefined ? <strong key={key++} className="font-bold text-app-text-strong">{m[3]}</strong> : <em key={key++}>{m[4]}</em>);
    }
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) nodes.push(<Linkified key={key++} text={rest} />);
  return <>{nodes}</>;
}

/** Il markdown dei riassunti dell'AI: titoli (##), elenchi con - o * (anche annidati), grassetto e corsivo. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {text.split("\n").map((raw, i) => {
        if (raw.trim() === "") return null;
        const heading = /^#{1,6}\s+(.*)$/.exec(raw);
        if (heading) {
          return (
            <h4 key={i} className={cn("text-[15px] font-extrabold text-app-text-strong", i > 0 && "mt-2")}>
              <Inline text={heading[1]} />
            </h4>
          );
        }
        const bullet = /^(\s*)[-*•]\s+(.*)$/.exec(raw);
        if (bullet) {
          const depth = Math.min(3, Math.floor(bullet[1].length / 2));
          return (
            <div key={i} className="flex gap-2" style={{ paddingLeft: depth * 18 }}>
              <span className="text-app-text-dim">{depth > 0 ? "–" : "•"}</span>
              <span className="min-w-0 flex-1"><Inline text={bullet[2]} /></span>
            </div>
          );
        }
        return <p key={i}><Inline text={raw} /></p>;
      })}
    </div>
  );
}

/** Solo emoji (e spazi), al massimo 12: il messaggio si mostra più grande, come nelle altre chat. */
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}\u200D\uFE0F\u20E3\s]+$/u;
function isEmojiOnly(body: string): boolean {
  const text = body.trim();
  if (!text || !EMOJI_ONLY.test(text) || !/[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(text)) return false;
  const clusters = typeof Intl.Segmenter === "function" ? [...new Intl.Segmenter().segment(text.replace(/\s+/g, ""))].length : text.length;
  return clusters <= 12;
}

function MessageBodyContent({ style, body, authorName, edited, className }: Props) {
  const { t } = useI18n();
  const suffix: ReactNode = edited ? <span className="ml-1.5 font-sans text-xs text-app-text-dim not-italic">{t("chat.edited")}</span> : null;
  const base = "text-[15px] leading-normal break-words text-app-text";

  switch (style) {
    case "me":
      return (
        <p className={cn(base, "whitespace-pre-wrap italic", className)}>
          <span className="not-italic">✱ </span>
          {authorName} <Linkified text={body} />
          {suffix}
        </p>
      );
    case "code":
      return (
        <div className={cn(base, "w-fit max-w-full rounded-lg border border-app-border bg-app-field px-3 py-2 font-mono text-[13px] whitespace-pre-wrap", className)}>
          {body}
          {suffix}
        </div>
      );
    case "pre":
      return (
        <p className={cn(base, "font-mono text-[13px] whitespace-pre", className)}>
          {body}
          {suffix}
        </p>
      );
    case "quote":
      return (
        <blockquote className={cn(base, "border-l-4 border-app-border-strong pl-3 whitespace-pre-wrap text-app-text-muted", className)}>
          <Linkified text={body} />
          {suffix}
        </blockquote>
      );
    case "spoiler":
      return (
        <p className={cn(base, "whitespace-pre-wrap", className)}>
          <span
            title={t("chat.spoilerHint")}
            className="cursor-pointer rounded bg-app-raised px-1 text-transparent transition-colors select-none hover:bg-transparent hover:text-app-text hover:select-text"
          >
            <Linkified text={body} />
          </span>
          {suffix}
        </p>
      );
    case "random": {
      const [n, min, max] = body.split("|");
      return (
        <p className={cn(base, className)}>
          🎲 <strong className="text-app-text-strong">{n}</strong>
          <span className="ml-1.5 text-xs text-app-text-dim">
            ({min}–{max})
          </span>
        </p>
      );
    }
    case "flip":
      return (
        <p className={cn(base, className)}>
          🪙 <strong className="text-app-text-strong">{body === "heads" ? t("chat.flipHeads") : t("chat.flipTails")}</strong>
        </p>
      );
    default:
      return (
        <p className={cn(base, "whitespace-pre-wrap", isEmojiOnly(body) && "text-[24px] leading-tight", className)}>
          <Linkified text={body} />
          {suffix}
        </p>
      );
  }
}
