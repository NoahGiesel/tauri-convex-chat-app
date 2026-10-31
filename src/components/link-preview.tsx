import { useEffect, useRef } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { openLink } from "@/lib/links";

const RETRY_FAILED_MS = 60 * 60 * 1000;

/** Anteprima Open Graph di un link: titolo, descrizione e immagine, come in Slack. */
export function LinkPreview({ url, onLayout }: { url: string; onLayout?: () => void }) {
  const preview = useQuery(api.previews.get, { url });
  const fetchPreview = useAction(api.previews.fetchPreview);
  const requested = useRef(false);

  // Se nessuno l'ha ancora richiesta (o l'ultimo tentativo è fallito da un'ora), la si scarica sul server.
  useEffect(() => {
    if (preview === undefined || requested.current) return;
    if (preview === null || (!preview.ok && Date.now() - preview.fetchedAt > RETRY_FAILED_MS)) {
      requested.current = true;
      void fetchPreview({ url }).catch(() => undefined);
    }
  }, [preview, url, fetchPreview]);

  const visible = !!preview && preview.ok;
  useEffect(() => {
    if (visible) onLayout?.();
  }, [visible, onLayout]);

  if (!preview || !preview.ok) return null;

  return (
    <a
      href={url}
      rel="noreferrer noopener"
      onClick={(e) => {
        e.preventDefault();
        void openLink(url);
      }}
      className="mt-1.5 flex max-w-[min(460px,100%)] items-stretch overflow-hidden rounded-xl border border-app-border border-l-4 border-l-app-accent bg-app-field/50 hover:bg-app-field"
    >
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={onLayout}
          className="m-2 mr-0 size-24 shrink-0 self-center rounded-lg object-cover"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2">
        {preview.siteName && <div className="truncate text-xs text-app-text-dim">{preview.siteName}</div>}
        {preview.title && <div className="line-clamp-2 text-[15px] leading-snug font-bold text-app-accent-text">{preview.title}</div>}
        {preview.description && <div className="mt-0.5 line-clamp-2 text-sm text-app-text-muted">{preview.description}</div>}
      </div>
    </a>
  );
}
