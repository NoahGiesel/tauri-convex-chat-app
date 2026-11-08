import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { espnDays, fetchNextMatch, fetchScoreboard, type ProviderMatch } from "./espn";
import { teamRow } from "./footballTeams";
import schema from "./schema";

/** Più pin di quanti l'app ne avrà mai: ogni chat ne ha al massimo 3. */
const MAX_PINS_SCANNED = 5000;
/** Più partite di quante se ne seguano mai in un giro. */
const MAX_POLLED = 300;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Una partita si segue da 60 minuti prima del calcio d'inizio. */
const POLL_BEFORE_KICKOFF_MS = 60 * MINUTE;
/** Ancora `pre` dopo il calcio d'inizio: è in ritardo e si segue ancora, ma non oltre 3 ore. */
const MAX_DELAY_MS = 3 * HOUR;
/** Una partita `in` da più di 6 ore è rimasta indietro (ESPN non la manda più): si smette di seguirla. */
const MAX_LIVE_MS = 6 * HOUR;
/** La pulizia toglie le partite finite da più di 7 giorni. */
const KEEP_FINISHED_MS = 7 * 24 * HOUR;
const MAX_CLEANED = 200;
/** Le partite tenute (ultime o prossime di una squadra) che la pulizia può scorrere in un giro. */
const MAX_CLEANUP_SCANNED = 2000;
/** Una partita sparita dal suo tabellone fa cercare la prossima al massimo ogni 10 minuti. */
const MISSING_RETRY_MS = 10 * MINUTE;

/** Una partita come la manda il fornitore: la riga di `footballMatches` senza `fetchedAt`. */
export const matchValidator = schema.tables.footballMatches.validator.omit("fetchedAt");

/** Una partita chiusa: finita, interrotta, oppure rinviata o annullata (che ESPN dia `pre` o `post`). */
const isClosed = (m: { state: string; statusName: string }) => m.state === "post" || /POSTPONED|CANCEL/.test(m.statusName);

/**
 * Scrive (o aggiorna) una partita, una sola riga per partita ESPN. Una risposta più vecchia di quella già scritta
 * (due richieste sovrapposte) si scarta. Quando la partita si chiude diventa l'ultima partita delle sue squadre
 * pinnate e parte la ricerca della prossima, da qualunque richiesta arrivi la notizia.
 */
export async function recordMatch(ctx: MutationCtx, match: ProviderMatch, fetchedAt: number): Promise<Id<"footballMatches">> {
  const existing = await matchByEvent(ctx, match.eventId);
  if (existing && existing.fetchedAt > fetchedAt) return existing._id;
  const row = { score: undefined, shootout: undefined, clock: undefined, ...match, fetchedAt };
  const id = existing ? existing._id : await ctx.db.insert("footballMatches", row);
  if (existing) await ctx.db.replace("footballMatches", id, row);
  if (isClosed(match) && !(existing && isClosed(existing))) {
    for (const team of await pinnedSides(ctx, match)) {
      await ctx.db.patch("footballTeams", team._id, { lastMatchId: id });
      await ctx.scheduler.runAfter(0, internal.footballMatches.refreshNextMatch, { teamId: team.teamId });
    }
  }
  return id;
}

async function matchByEvent(ctx: QueryCtx, eventId: string): Promise<Doc<"footballMatches"> | null> {
  return await ctx.db
    .query("footballMatches")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique();
}

async function isPinned(ctx: QueryCtx, teamId: string): Promise<boolean> {
  return (await ctx.db.query("teamPins").withIndex("by_teamId", (q) => q.eq("teamId", teamId)).first()) !== null;
}

/** Le righe dell'indice delle squadre pinnate che giocano questa partita. */
async function pinnedSides(ctx: QueryCtx, match: Pick<ProviderMatch, "home" | "away">): Promise<Doc<"footballTeams">[]> {
  const sides = [];
  for (const teamId of [match.home.teamId, match.away.teamId]) {
    const team = await teamRow(ctx, teamId);
    if (team && (await isPinned(ctx, teamId))) sides.push(team);
  }
  return sides;
}

/** Chiede a ESPN la prossima partita di una squadra. Se la richiesta fallisce non cambia niente: riprova il prossimo giro. */
export const refreshNextMatch = internalAction({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    let match: ProviderMatch | null;
    const fetchedAt = Date.now();
    try {
      match = await fetchNextMatch(args.teamId);
    } catch (e) {
      console.error(`Prossima partita di ${args.teamId}:`, e instanceof Error ? e.message : e);
      return null;
    }
    await ctx.runMutation(internal.footballMatches.saveNextMatch, { teamId: args.teamId, match, fetchedAt });
    return null;
  },
});

export const saveNextMatch = internalMutation({
  args: { teamId: v.string(), match: v.union(matchValidator, v.null()), fetchedAt: v.number() },
  handler: async (ctx, args) => {
    const team = await teamRow(ctx, args.teamId);
    if (!team) return null;
    const nextMatchId = args.match ? await recordMatch(ctx, args.match, args.fetchedAt) : undefined;
    await ctx.db.patch("footballTeams", team._id, { nextMatchId });
    return null;
  },
});

/** Ogni 6 ore: la prossima partita di ogni squadra pinnata (una richiesta per squadra, anche se è pinnata in più chat). */
export const refreshPinnedTeams = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pins = await ctx.db.query("teamPins").take(MAX_PINS_SCANNED);
    for (const teamId of new Set(pins.map((pin) => pin.teamId))) {
      await ctx.scheduler.runAfter(0, internal.footballMatches.refreshNextMatch, { teamId });
    }
    return null;
  },
});

/**
 * Ogni 30 secondi: si seguono le partite in corso e quelle a meno di 60 minuti dal calcio d'inizio
 * (anche se il calcio d'inizio è in ritardo), purché siano l'ultima o la prossima di una squadra pinnata.
 * Per ogni competizione parte una sola richiesta, anche con più chat o un derby. Senza partite non parte niente.
 */
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const live = await ctx.db
      .query("footballMatches")
      .withIndex("by_state_and_kickoff", (q) => q.eq("state", "in").gt("kickoff", now - MAX_LIVE_MS))
      .take(MAX_POLLED);
    const soon = await ctx.db
      .query("footballMatches")
      .withIndex("by_state_and_kickoff", (q) => q.eq("state", "pre").gt("kickoff", now - MAX_DELAY_MS).lt("kickoff", now + POLL_BEFORE_KICKOFF_MS))
      .take(MAX_POLLED);

    const byLeague = new Map<string, { eventId: string; kickoff: number }[]>();
    for (const match of [...live, ...soon]) {
      const followed = (await pinnedSides(ctx, match)).some((team) => team.nextMatchId === match._id || team.lastMatchId === match._id);
      if (!followed) continue;
      byLeague.set(match.league, [...(byLeague.get(match.league) ?? []), { eventId: match.eventId, kickoff: match.kickoff }]);
    }
    for (const [league, matches] of byLeague) {
      await ctx.scheduler.runAfter(0, internal.footballMatches.pollLeague, { league, matches });
    }
    return null;
  },
});

/** Legge il tabellone di una competizione e aggiorna le partite seguite. Se la richiesta fallisce non cambia niente. */
export const pollLeague = internalAction({
  args: { league: v.string(), matches: v.array(v.object({ eventId: v.string(), kickoff: v.number() })) },
  handler: async (ctx, args) => {
    const wanted = new Set(args.matches.map((m) => m.eventId));
    const found = new Map<string, ProviderMatch>();
    const fetchedAt = Date.now();
    try {
      for (const day of new Set(args.matches.flatMap((m) => espnDays(m.kickoff)))) {
        for (const match of await fetchScoreboard(args.league, day)) if (wanted.has(match.eventId)) found.set(match.eventId, match);
      }
    } catch (e) {
      console.error(`Tabellone ${args.league}:`, e instanceof Error ? e.message : e);
      return null;
    }
    const missing = [...wanted].filter((eventId) => !found.has(eventId));
    await ctx.runMutation(internal.footballMatches.applyPoll, { matches: [...found.values()], missing, fetchedAt });
    return null;
  },
});

/**
 * Scrive le partite lette dal tabellone (`recordMatch` gestisce quelle che si chiudono).
 * Una partita sparita dal tabellone del suo giorno è stata spostata: si cerca di nuovo la prossima partita
 * delle sue squadre, al massimo ogni 10 minuti (la ricerca rinfresca `fetchedAt` se ESPN dà ancora la stessa partita).
 */
export const applyPoll = internalMutation({
  args: { matches: v.array(matchValidator), missing: v.array(v.string()), fetchedAt: v.number() },
  handler: async (ctx, args) => {
    for (const match of args.matches) await recordMatch(ctx, match, args.fetchedAt);
    for (const eventId of args.missing) {
      const row = await matchByEvent(ctx, eventId);
      if (!row || args.fetchedAt - row.fetchedAt < MISSING_RETRY_MS) continue;
      console.warn(`Partita ${eventId} non più nel tabellone del suo giorno: cerco di nuovo la prossima`);
      for (const team of await pinnedSides(ctx, row)) {
        await ctx.scheduler.runAfter(0, internal.footballMatches.refreshNextMatch, { teamId: team.teamId });
      }
    }
    return null;
  },
});

/**
 * Ogni giorno: toglie le partite di più di 7 giorni fa (anche quelle rimaste `pre` o `in` perché ESPN non le dava più),
 * tranne quelle che sono ancora l'ultima o la prossima partita di una squadra. Quelle tenute non bloccano le altre.
 */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const before = Date.now() - KEEP_FINISHED_MS;
    let deleted = 0;
    let scanned = 0;
    for (const state of ["post", "pre", "in"] as const) {
      const old = ctx.db.query("footballMatches").withIndex("by_state_and_kickoff", (q) => q.eq("state", state).lt("kickoff", before));
      for await (const match of old) {
        if (++scanned > MAX_CLEANUP_SCANNED || deleted >= MAX_CLEANED) return null;
        const asLast = await ctx.db.query("footballTeams").withIndex("by_lastMatchId", (q) => q.eq("lastMatchId", match._id)).first();
        const asNext = await ctx.db.query("footballTeams").withIndex("by_nextMatchId", (q) => q.eq("nextMatchId", match._id)).first();
        if (asLast || asNext) continue;
        await ctx.db.delete("footballMatches", match._id);
        deleted++;
      }
    }
    return null;
  },
});
