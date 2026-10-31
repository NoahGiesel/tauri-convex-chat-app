// Riconoscimento dei link nei testi: condiviso da server (elenco "Media e link") e client (link cliccabili).

export type TextPart = { type: "text"; text: string } | { type: "link"; text: string; href: string };

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/** Spezza un testo in pezzi di testo semplice e link (http, https e www.). */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    let raw = match[0];
    // La punteggiatura finale ("vedi https://a.it.") e le parentesi chiuse non bilanciate non fanno parte del link.
    for (;;) {
      const end = raw.at(-1);
      const unbalancedParen = end === ")" && (raw.match(/\(/g)?.length ?? 0) < (raw.match(/\)/g)?.length ?? 0);
      if (end && (/[.,;:!?'"\]}]/.test(end) || unbalancedParen)) raw = raw.slice(0, -1);
      else break;
    }
    if (!/^(?:https?:\/\/|www\.)[^\s.]/i.test(raw) || raw.length < 4) continue;
    const start = match.index ?? 0;
    if (start > last) parts.push({ type: "text", text: text.slice(last, start) });
    parts.push({ type: "link", text: raw, href: /^www\./i.test(raw) ? `https://${raw}` : raw });
    last = start + raw.length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}

/** URL distinti presenti in un testo, nell'ordine in cui compaiono. */
export function extractLinks(text: string): string[] {
  return [...new Set(splitLinks(text).flatMap((p) => (p.type === "link" ? [p.href] : [])))];
}

/** Un messaggio mostra dei link solo se è testo normale, /me o /quote, oppure una didascalia di allegati. */
export function carriesLinks(kind: string, style: string | null | undefined, body: string): boolean {
  const shown = kind === "media" || (kind === "text" && (!style || style === "me" || style === "quote"));
  return shown && extractLinks(body).length > 0;
}
