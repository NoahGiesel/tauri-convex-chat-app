import type { ReactNode } from "react";
import { useI18n } from "@/i18n/i18n-provider";
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
export function MessageBody({ style, body, authorName, edited, className }: Props) {
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
        <p className={cn(base, "whitespace-pre-wrap", className)}>
          <Linkified text={body} />
          {suffix}
        </p>
      );
  }
}
