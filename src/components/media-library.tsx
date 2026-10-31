import { useMemo, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { Link2, Play, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { LightboxItem } from "@/components/media-lightbox";
import { useI18n } from "@/i18n/i18n-provider";
import { openLink } from "@/lib/links";
import { cn } from "@/lib/utils";

type Tab = "media" | "links";
const PAGE = 30;

/** Tutte le foto, i video e i link mandati in una chat o in un gruppo. */
export function MediaLibrary({
  conversationId,
  onOpenMedia,
  onClose,
}: {
  conversationId: Id<"conversations">;
  onOpenMedia: (item: LightboxItem) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("media");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" className="flex shrink-0 gap-1 border-b border-app-border px-6 pt-2">
        {(["media", "links"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-semibold",
              tab === id ? "border-app-accent text-app-text-strong" : "border-transparent text-app-text-muted hover:text-app-text",
            )}
          >
            {t(id === "media" ? "library.media" : "library.links")}
          </button>
        ))}
        <button
          type="button"
          aria-label={t("common.close")}
          title={t("common.close")}
          onClick={onClose}
          className="mb-1 ml-auto flex size-8 items-center justify-center rounded-lg text-app-text-muted hover:bg-app-field hover:text-app-text"
        >
          <X className="size-4" strokeWidth={2.2} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {tab === "media" ? <MediaTab conversationId={conversationId} onOpenMedia={onOpenMedia} /> : <LinksTab conversationId={conversationId} />}
      </div>
    </div>
  );
}

function LoadMore({ status, onMore }: { status: string; onMore: () => void }) {
  const { t } = useI18n();
  if (status !== "CanLoadMore" && status !== "LoadingMore") return null;
  return (
    <div className="flex justify-center pt-4">
      <button
        type="button"
        disabled={status === "LoadingMore"}
        onClick={onMore}
        className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-app-accent-text hover:bg-app-field disabled:opacity-50"
      >
        {t("library.loadMore")}
      </button>
    </div>
  );
}

function MediaTab({ conversationId, onOpenMedia }: { conversationId: Id<"conversations">; onOpenMedia: (item: LightboxItem) => void }) {
  const { t } = useI18n();
  const { results, status, loadMore } = usePaginatedQuery(api.library.media, { conversationId }, { initialNumItems: PAGE });
  const items = useMemo(() => results.flatMap((m) => m.attachments.map((a, i) => ({ ...a, key: `${m._id}-${i}`, author: m.authorName }))), [results]);

  if (status === "LoadingFirstPage") return null;
  if (items.length === 0) return <p className="pt-10 text-center text-sm text-app-text-muted">{t("library.noMedia")}</p>;

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
        {items.map((a) => (
          <button
            key={a.key}
            type="button"
            title={`${a.name} · ${a.author}`}
            onClick={() => onOpenMedia({ url: a.url, type: a.type, name: a.name })}
            className="group relative aspect-square overflow-hidden rounded-xl bg-app-field"
          >
            {a.type === "image" ? (
              <img src={a.url} alt={a.name} loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
            ) : (
              <>
                <video src={`${a.url}#t=0.1`} preload="metadata" muted playsInline className="size-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <span className="flex size-9 items-center justify-center rounded-full bg-black/60 text-white">
                    <Play className="size-4 fill-current" />
                  </span>
                </span>
              </>
            )}
          </button>
        ))}
      </div>
      <LoadMore status={status} onMore={() => loadMore(PAGE)} />
    </>
  );
}

function LinksTab({ conversationId }: { conversationId: Id<"conversations"> }) {
  const { t, language } = useI18n();
  const { results, status, loadMore } = usePaginatedQuery(api.library.links, { conversationId }, { initialNumItems: PAGE });
  const rows = useMemo(
    () => results.flatMap((m) => m.links.map((l, i) => ({ ...l, key: `${m._id}-${i}`, author: m.authorName, at: m._creationTime }))),
    [results],
  );
  const date = (ms: number) => new Date(ms).toLocaleDateString(language, { day: "numeric", month: "short", year: "numeric" });

  if (status === "LoadingFirstPage") return null;
  if (rows.length === 0) return <p className="pt-10 text-center text-sm text-app-text-muted">{t("library.noLinks")}</p>;

  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {rows.map((l) => (
          <li key={l.key}>
            <a
              href={l.url}
              rel="noreferrer noopener"
              onClick={(e) => {
                e.preventDefault();
                void openLink(l.url);
              }}
              className="flex items-center gap-3 rounded-xl border border-app-border p-2.5 hover:bg-app-field"
            >
              {l.image ? (
                <img src={l.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-14 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-app-field text-app-text-muted">
                  <Link2 className="size-5" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-app-accent-text">{l.title ?? l.url}</span>
                <span className="block truncate text-xs text-app-text-muted">{l.siteName ? `${l.siteName} · ${l.url}` : l.url}</span>
                <span className="block truncate text-xs text-app-text-dim">
                  {l.author} · {date(l.at)}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <LoadMore status={status} onMore={() => loadMore(PAGE)} />
    </>
  );
}
