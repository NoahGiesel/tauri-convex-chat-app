import { useMemo, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { Link2, Play, Sparkles, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AskCard } from "@/components/ask-card";
import { SummaryCard } from "@/components/summary-card";
import type { LightboxItem } from "@/components/media-lightbox";
import { useI18n } from "@/i18n/i18n-provider";
import { openLink } from "@/lib/links";
import { cn } from "@/lib/utils";

type Tab = "media" | "links" | "ai" | "games";
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
        {(["media", "links", "ai", "games"] as const).map((id) => (
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
            {id === "ai" ? t("chat.aiName") : id === "games" ? t("library.games") : t(id === "media" ? "library.media" : "library.links")}
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
        {tab === "media" && <MediaTab conversationId={conversationId} onOpenMedia={onOpenMedia} />}
        {tab === "links" && <LinksTab conversationId={conversationId} />}
        {tab === "ai" && <AiTab conversationId={conversationId} />}
        {tab === "games" && <GamesTab conversationId={conversationId} />}
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

function AiTab({ conversationId }: { conversationId: Id<"conversations"> }) {
  const { t, language } = useI18n();
  const { results, status, loadMore } = usePaginatedQuery(api.library.ai, { conversationId }, { initialNumItems: PAGE });
  const when = (ms: number) => new Date(ms).toLocaleString(language, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  if (status === "LoadingFirstPage") return null;
  if (results.length === 0) return <p className="pt-10 text-center text-sm text-app-text-muted">{t("library.noAi")}</p>;

  return (
    <>
      <ul className="flex flex-col gap-4">
        {results.map((a) => (
          <li key={a._id} className="flex flex-col">
            <div className="flex items-center gap-1.5 text-xs text-app-text-dim">
              <Sparkles className="size-3.5 text-app-ai" strokeWidth={2} />
              <span>
                {t("library.aiRequestedBy", { name: a.requestedByName })} · {when(a._creationTime)}
              </span>
            </div>
            {a.source &&
              (a.sourceIsLink ? (
                <a
                  href={a.source}
                  rel="noreferrer noopener"
                  onClick={(e) => {
                    e.preventDefault();
                    void openLink(a.source!);
                  }}
                  className="mt-1 truncate text-sm font-semibold text-app-accent-text hover:underline"
                >
                  {a.source}
                </a>
              ) : (
                <div className="mt-1 truncate text-sm text-app-text-muted">{a.kind === "ask" ? `/ask ${a.source}` : `${a.source}…`}</div>
              ))}
            {a.kind === "ask" ? <AskCard status={a.status} body={a.body} /> : <SummaryCard status={a.status} body={a.body} source={a.source} />}
          </li>
        ))}
      </ul>
      <LoadMore status={status} onMore={() => loadMore(PAGE)} />
    </>
  );
}

/** Storico dei giochi della chat (sasso-carta-forbici e quiz), con le statistiche di chi ha giocato. */
function GamesTab({ conversationId }: { conversationId: Id<"conversations"> }) {
  const { t, language } = useI18n();
  const rps = useQuery(api.games.history, { conversationId });
  const quiz = useQuery(api.quizzes.history, { conversationId });
  const when = (ms: number) => new Date(ms).toLocaleString(language, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  if (!rps || !quiz) return null;
  if (rps.total === 0 && quiz.total === 0) return <p className="pt-10 text-center text-sm text-app-text-muted">{t("library.noGames")}</p>;

  /** Una riga per gioco: titolo e totali, poi i due giocatori con vittorie e una barra che li mette a confronto. */
  const stats = (
    title: string,
    total: number,
    draws: number,
    players: { profileId: string; name: string; wins: number; extra: string }[],
  ) => {
    if (total === 0) return null;
    const [p1, p2] = players;
    const wins = players.reduce((sum, p) => sum + p.wins, 0);
    const share = p1 && p2 && wins > 0 ? (p1.wins / wins) * 100 : 50;
    return (
      <section className="flex flex-col gap-2.5 rounded-xl border border-app-border bg-app-panel px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-app-text-strong">{title}</span>
          <span className="text-xs text-app-text-dim">
            {t("library.gamesPlayed", { count: total })}
            {draws > 0 ? ` · ${t("library.gamesDraws", { count: draws })}` : ""}
          </span>
        </div>
        {p1 && p2 ? (
          <>
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-app-text">{p1.name}</span>
              <span className="text-xl leading-none font-extrabold text-app-text-strong tabular-nums">
                {p1.wins}
                <span className="px-1.5 text-sm font-bold text-app-text-dim">–</span>
                {p2.wins}
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-app-text">{p2.name}</span>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-app-border" aria-hidden>
              {wins > 0 && (
                <>
                  <div className="bg-app-accent transition-[width]" style={{ width: `${share}%` }} />
                  <div className="bg-app-text-dim/60" style={{ width: `${100 - share}%` }} />
                </>
              )}
            </div>
            <div className="flex justify-between text-[11px] text-app-text-dim">
              <span>{p1.extra}</span>
              <span>{p2.extra}</span>
            </div>
          </>
        ) : (
          players.map((p) => (
            <div key={p.profileId} className="flex items-center justify-between text-sm">
              <span className="font-semibold text-app-text">{p.name}</span>
              <span className="font-extrabold text-app-text-strong">{p.wins}</span>
            </div>
          ))
        )}
      </section>
    );
  };

  const list = [
    ...rps.recent.map((g) => ({ ...g, icon: "🪨", mode: null as string | null })),
    ...quiz.recent.map((g) => ({ ...g, icon: "🧠", mode: `quiz${g.size}` as string | null })),
  ].sort((x, y) => y.finishedAt - x.finishedAt);

  return (
    <div className="flex flex-col gap-3">
      {stats(
        `🪨 ${t("game.title")}`,
        rps.total,
        rps.draws,
        rps.players.map((p) => ({ profileId: p.profileId, name: p.name, wins: p.wins, extra: t("library.gamesRounds", { count: p.roundWins }) })),
      )}
      {stats(
        `🧠 ${t("library.quizzes")}`,
        quiz.total,
        quiz.draws,
        quiz.players.map((p) => ({ profileId: p.profileId, name: p.name, wins: p.wins, extra: t("library.quizPoints", { count: p.points }) })),
      )}

      <ul className="mt-1 flex flex-col divide-y divide-app-border">
        {list.map((g) => (
          <li key={g._id} className="flex items-center gap-2.5 py-2">
            <span className="w-5 shrink-0 text-center text-base">{g.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-app-text">
                {g.nameA} <span className="font-extrabold text-app-text-strong">{g.scoreA}–{g.scoreB}</span> {g.nameB}
              </div>
              <div className="text-[11px] text-app-text-dim">
                {when(g.finishedAt)}
                {g.mode && <span className="ml-1.5 rounded bg-app-field px-1 py-px font-mono font-semibold text-app-text-muted">{g.mode}</span>}
              </div>
            </div>
            <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold", g.winnerSide ? "bg-app-accent-soft text-app-accent-text" : "bg-app-field text-app-text-muted")}>
              {g.winnerSide ? g.winnerSide === "a" ? g.nameA : g.nameB : t("library.gameTie")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
