import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  espnDays,
  fetchNextMatch,
  fetchSchedule,
  fetchScoreboard,
  fetchSummary,
  type ProviderDetails,
  type ProviderMatch,
  type ProviderScheduleMatch,
} from "./espn";
import { deleteUnpinnedSchedules, scheduleOf } from "./footballTeamSchedules";
import { fail, getProfile, requireMember, requireProfile } from "./model";
import { rateLimiter } from "./rateLimits";
import { teamRow } from "./footballTeams";
import { MAX_TEAM_PINS } from "./teamPins";
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
/** Il riassunto finale, se alla fine non arriva, si riprova a parte (poi la partita non si segue più): 3 tentativi in tutto. */
const FINAL_DETAILS_ATTEMPTS = 3;
const FINAL_DETAILS_RETRY_MS = 2 * MINUTE;
/** Il calendario di una squadra si rifà dieci minuti dopo il fischio finale, quando ESPN dà il risultato. */
const FULL_TIME_REFRESH_MS = 10 * MINUTE;
/** Una partita vecchia chiesta da poco non si richiede: clic ripetuti e più chat condividono un riassunto. */
const PAST_DETAILS_DEDUPE_MS = 60_000;

/** Una partita come la manda il fornitore: la riga di `footballMatches` senza `fetchedAt`. */
export const matchValidator = schema.tables.footballMatches.validator.omit("fetchedAt");
/** I dettagli come li manda il fornitore: la riga di `footballMatchDetails` senza partita e `fetchedAt`. */
const detailsValidator = schema.tables.footballMatchDetails.validator.omit("matchId", "fetchedAt");

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
      // Il risultato arriva nel calendario un po' dopo il fischio finale: si rifà a FT + 10 minuti, con
      // la classifica del campionato della partita (le due richieste del calendario più una).
      await ctx.scheduler.runAfter(FULL_TIME_REFRESH_MS, internal.footballTeamSchedules.refresh, {
        teamId: team.teamId,
        standingsLeague: match.league,
      });
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

async function detailsOf(ctx: QueryCtx, matchId: Id<"footballMatches">): Promise<Doc<"footballMatchDetails"> | null> {
  return await ctx.db
    .query("footballMatchDetails")
    .withIndex("by_matchId", (q) => q.eq("matchId", matchId))
    .unique();
}

function sameDetails(saved: Doc<"footballMatchDetails">, fresh: ProviderDetails): boolean {
  const { _id, _creationTime, matchId, fetchedAt, ...rest } = saved;
  return canonical(rest) === canonical(fresh);
}

/** JSON con le chiavi in ordine: due oggetti uguali danno la stessa stringa qualunque sia l'ordine dei campi. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === "object" && v !== null && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );
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

/**
 * La partita di una squadra che si sta giocando adesso. Serve quando il pin arriva a partita iniziata:
 * `nextEvent` dà già quella dopo (vedi `fetchNextMatch`). La competizione viene dal calendario della squadra,
 * non dal suo campionato: una nazionale gioca Nations League e qualificazioni, un club le coppe.
 * La partita si legge poi dal tabellone di quella competizione, che dà minuto e punteggio aggiornati.
 */
async function fetchCurrentMatch(teamId: string, now: number): Promise<ProviderMatch | null> {
  const { matches } = await fetchSchedule(teamId, "fixtures");
  const started = matches.filter((m) => m.state !== "post" && m.kickoff <= now && m.kickoff > now - MAX_LIVE_MS);
  for (const entry of started) {
    for (const day of espnDays(entry.kickoff)) {
      const match = (await fetchScoreboard(entry.league, day)).find((m) => m.eventId === entry.eventId);
      if (!match) continue;
      // In corso, oppure in ritardo (il calcio d'inizio è passato ma ESPN la dà ancora `pre`).
      if (match.state === "in" && match.kickoff > now - MAX_LIVE_MS) return match;
      if (match.state === "pre" && match.kickoff <= now && match.kickoff > now - MAX_DELAY_MS) return match;
    }
  }
  return null;
}

/** Chiede a ESPN la prossima partita di una squadra. Se la richiesta fallisce non cambia niente: riprova il prossimo giro. */
export const refreshNextMatch = internalAction({
  args: { teamId: v.string(), force: v.optional(v.boolean()), justPinned: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    let match: ProviderMatch | null;
    const fetchedAt = Date.now();
    try {
      match = await fetchNextMatch(args.teamId);
    } catch (e) {
      console.error(`Prossima partita di ${args.teamId}:`, e instanceof Error ? e.message : e);
      return null;
    }
    // `justPinned` arriva quando il pin è appena stato messo: se la squadra sta giocando, `nextEvent` non lo dice.
    if (args.justPinned) {
      try {
        match = (await fetchCurrentMatch(args.teamId, fetchedAt)) ?? match;
      } catch (e) {
        // Calendario e tabellone sono un'informazione in più: senza, resta la prossima partita.
        console.error(`Partita in corso di ${args.teamId}:`, e instanceof Error ? e.message : e);
      }
    }
    await ctx.runMutation(internal.footballMatches.saveNextMatch, { teamId: args.teamId, match, fetchedAt, force: args.force });
    return null;
  },
});

/**
 * La partita della squadra che si sta giocando adesso (o sta per iniziare): la ricerca della prossima non deve nasconderla.
 * ESPN, mentre una partita è in corso, dà già come `nextEvent` quella dopo: senza questo controllo il chip passerebbe
 * alla partita seguente e la diretta non verrebbe più aggiornata.
 */
async function matchOnNow(ctx: MutationCtx, team: Doc<"footballTeams">, now: number): Promise<Doc<"footballMatches"> | null> {
  if (!team.nextMatchId) return null;
  const current = await ctx.db.get("footballMatches", team.nextMatchId);
  if (!current || isClosed(current)) return null;
  return current.kickoff > now - MAX_LIVE_MS && current.kickoff < now + POLL_BEFORE_KICKOFF_MS ? current : null;
}

export const saveNextMatch = internalMutation({
  args: { teamId: v.string(), match: v.union(matchValidator, v.null()), fetchedAt: v.number(), force: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const team = await teamRow(ctx, args.teamId);
    if (!team) return null;
    // Una partita diversa (o nessuna) mentre se ne gioca una: si tiene quella in corso, che il giro dei 30 secondi aggiorna.
    // `force` arriva quando la partita è sparita dal tabellone: lì vale la ricerca nuova, perché è stata spostata.
    const onNow = args.force ? null : await matchOnNow(ctx, team, args.fetchedAt);
    if (onNow && onNow.eventId !== args.match?.eventId) return null;
    const nextMatchId = args.match ? await recordMatch(ctx, args.match, args.fetchedAt) : undefined;
    await ctx.db.patch("footballTeams", team._id, { nextMatchId });
    return null;
  },
});

/**
 * I campionati con una partita in corso di una squadra pinnata. La classifica non cambia durante una
 * partita, quindi non si chiede: il cron e il refresco del pin saltano tutto il campionato, non solo
 * le squadre che stanno giocando. Un'action lo legge con `liveLeagueNames`.
 */
export async function liveLeagues(ctx: QueryCtx): Promise<Set<string>> {
  const pins = await ctx.db.query("teamPins").take(MAX_PINS_SCANNED);
  const leagues = new Set<string>();
  for (const teamId of new Set(pins.map((pin) => pin.teamId))) {
    const team = await teamRow(ctx, teamId);
    const match = team?.nextMatchId ? await ctx.db.get("footballMatches", team.nextMatchId) : null;
    if (match?.state === "in") leagues.add(match.league);
  }
  return leagues;
}

/** Gli stessi campionati, per le action: non hanno `ctx.db`. */
export const liveLeagueNames = internalQuery({
  args: {},
  handler: async (ctx) => [...(await liveLeagues(ctx))],
});

/**
 * Ogni 6 ore: la prossima partita e il calendario di ogni squadra pinnata (una richiesta per squadra, anche se è
 * pinnata in più chat), poi la classifica di ogni competizione che le sue squadre giocano, una richiesta per
 * competizione anche con più squadre nello stesso campionato, tranne i campionati con una partita in corso.
 */
export const refreshPinnedTeams = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pins = await ctx.db.query("teamPins").take(MAX_PINS_SCANNED);
    const teamIds = new Set(pins.map((pin) => pin.teamId));
    const leagues = new Set<string>();
    for (const teamId of teamIds) {
      await ctx.scheduler.runAfter(0, internal.footballMatches.refreshNextMatch, { teamId });
      await ctx.scheduler.runAfter(0, internal.footballTeamSchedules.refresh, { teamId });
    }
    const live = await liveLeagues(ctx);
    for (const teamId of teamIds) {
      const schedule = await ctx.db
        .query("footballTeamSchedules")
        .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
        .unique();
      for (const competition of schedule?.competitions ?? []) if (!live.has(competition.league)) leagues.add(competition.league);
    }
    for (const league of leagues) await ctx.scheduler.runAfter(0, internal.footballStandings.refreshLeague, { league });
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
    // Il riassunto di ogni partita seguita, anche l'ultima volta (alla fine): poi resta salvato. Se non arriva, resta il precedente.
    const details: { eventId: string; details: ProviderDetails }[] = [];
    for (const match of found.values()) {
      try {
        details.push({ eventId: match.eventId, details: await fetchSummary(args.league, match.eventId) });
      } catch (e) {
        console.error(`Riassunto ${match.eventId}:`, e instanceof Error ? e.message : e);
        if (match.state === "post") {
          await ctx.scheduler.runAfter(FINAL_DETAILS_RETRY_MS, internal.footballMatches.retryFinalDetails, {
            league: args.league,
            eventId: match.eventId,
            attempt: 2,
          });
        }
      }
    }
    const missing = [...wanted].filter((eventId) => !found.has(eventId));
    await ctx.runMutation(internal.footballMatches.applyPoll, { matches: [...found.values()], details, missing, fetchedAt });
    return null;
  },
});

/** Riprova il riassunto di una partita appena finita, finché non arriva o finiscono i tentativi. */
export const retryFinalDetails = internalAction({
  args: { league: v.string(), eventId: v.string(), attempt: v.number() },
  handler: async (ctx, args) => {
    const fetchedAt = Date.now();
    let details: ProviderDetails;
    try {
      details = await fetchSummary(args.league, args.eventId);
    } catch (e) {
      console.error(`Riassunto finale ${args.eventId} (tentativo ${args.attempt}):`, e instanceof Error ? e.message : e);
      if (args.attempt < FINAL_DETAILS_ATTEMPTS) {
        await ctx.scheduler.runAfter(FINAL_DETAILS_RETRY_MS, internal.footballMatches.retryFinalDetails, { ...args, attempt: args.attempt + 1 });
      }
      return null;
    }
    await ctx.runMutation(internal.footballMatches.applyPoll, { matches: [], details: [{ eventId: args.eventId, details }], missing: [], fetchedAt });
    return null;
  },
});

/**
 * Scrive le partite lette dal tabellone (`recordMatch` gestisce quelle che si chiudono).
 * Una partita sparita dal tabellone del suo giorno è stata spostata: si cerca di nuovo la prossima partita
 * delle sue squadre, al massimo ogni 10 minuti (la ricerca rinfresca `fetchedAt` se ESPN dà ancora la stessa partita).
 */
export const applyPoll = internalMutation({
  args: {
    matches: v.array(matchValidator),
    details: v.array(v.object({ eventId: v.string(), details: detailsValidator })),
    missing: v.array(v.string()),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    for (const match of args.matches) await recordMatch(ctx, match, args.fetchedAt);
    for (const { eventId, details } of args.details) {
      const match = await matchByEvent(ctx, eventId);
      if (!match) continue;
      const existing = await detailsOf(ctx, match._id);
      if (existing && existing.fetchedAt > args.fetchedAt) continue;
      // Uguali a quelli salvati: non si riscrive, così le query iscritte non ripartono a ogni giro.
      if (existing && sameDetails(existing, details)) continue;
      const row = { ...details, matchId: match._id, fetchedAt: args.fetchedAt };
      if (existing) await ctx.db.replace("footballMatchDetails", existing._id, row);
      else await ctx.db.insert("footballMatchDetails", row);
    }
    for (const eventId of args.missing) {
      const row = await matchByEvent(ctx, eventId);
      if (!row || args.fetchedAt - row.fetchedAt < MISSING_RETRY_MS) continue;
      console.warn(`Partita ${eventId} non più nel tabellone del suo giorno: cerco di nuovo la prossima`);
      for (const team of await pinnedSides(ctx, row)) {
        await ctx.scheduler.runAfter(0, internal.footballMatches.refreshNextMatch, { teamId: team.teamId, force: true });
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
    // Anche il calendario di una squadra che nessuna chat pinna più se ne va.
    await deleteUnpinnedSchedules(ctx);
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
        const details = await detailsOf(ctx, match._id);
        if (details) await ctx.db.delete("footballMatchDetails", details._id);
        await ctx.db.delete("footballMatches", match._id);
        deleted++;
      }
    }
    return null;
  },
});

/** La riga di una squadra pinnata, come lato di una partita. */
function sideOf(team: Doc<"footballTeams">): Doc<"footballMatches">["home"] {
  return {
    teamId: team.teamId,
    name: team.name,
    shortName: team.shortName,
    abbreviation: team.abbreviation,
    ...(team.logo ? { logo: team.logo } : {}),
  };
}

/** La riga `footballMatches` di una partita vecchia, presa dal calendario di una squadra pinnata. */
function matchFromSchedule(
  entry: ProviderScheduleMatch,
  team: Doc<"footballTeams">,
  requestedAt: number,
): Omit<Doc<"footballMatches">, "_id" | "_creationTime"> {
  const pinned = sideOf(team);
  return {
    eventId: entry.eventId,
    league: entry.league,
    home: entry.home ? pinned : entry.opponent,
    away: entry.home ? entry.opponent : pinned,
    kickoff: entry.kickoff,
    state: "post",
    statusName: entry.statusName ?? "STATUS_FULL_TIME",
    ...(entry.score ? { score: entry.score } : {}),
    ...(entry.shootout ? { shootout: entry.shootout } : {}),
    detailsRequestedAt: requestedAt,
    fetchedAt: requestedAt,
  };
}

/** La partita vecchia nel calendario di una squadra che la chat pinna, con la riga della squadra. */
async function scheduledPastMatch(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
  eventId: string,
): Promise<{ entry: ProviderScheduleMatch; team: Doc<"footballTeams"> } | null> {
  const pins = await ctx.db
    .query("teamPins")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .take(MAX_TEAM_PINS);
  for (const pin of pins) {
    const schedule = await scheduleOf(ctx, pin.teamId);
    const entry = schedule ? [...schedule.results, ...schedule.fixtures].find((m) => m.eventId === eventId) : undefined;
    if (!entry || entry.state !== "post") continue;
    const team = await teamRow(ctx, pin.teamId);
    if (team) return { entry, team };
  }
  return null;
}

/**
 * Apre una partita vecchia dal tab Partite (docs/MATCH-DRAWER-SPEC.md, Older matches): scrive la riga `post` dal
 * calendario, una sola volta, e chiede il riassunto a ESPN. Non tocca la partita del chip, la diretta, `lastMatchId`
 * o `nextMatchId`; la pulizia giornaliera se la porta via come le altre partite vecchie.
 */
export const openPast = mutation({
  args: { conversationId: v.id("conversations"), eventId: v.string() },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    const found = await scheduledPastMatch(ctx, args.conversationId, args.eventId);
    if (!found) throw fail("match_not_in_schedule");
    if (!(await rateLimiter.limit(ctx, "openPast", { key: me._id })).ok) throw fail("too_many_match_opens");

    const now = Date.now();
    const existing = await matchByEvent(ctx, args.eventId);
    if (existing) {
      if (await detailsOf(ctx, existing._id)) return null;
      if (existing.detailsRequestedAt !== undefined && now - existing.detailsRequestedAt < PAST_DETAILS_DEDUPE_MS) return null;
      await ctx.db.patch("footballMatches", existing._id, { detailsRequestedAt: now });
    } else {
      await ctx.db.insert("footballMatches", matchFromSchedule(found.entry, found.team, now));
    }
    await ctx.scheduler.runAfter(0, internal.footballMatches.fetchPastDetails, { eventId: args.eventId });
    return null;
  },
});

/** Il riassunto di una partita vecchia aperta dal drawer. Se non arriva, i dettagli restano assenti. */
export const fetchPastDetails = internalAction({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const fetchedAt = Date.now();
    let details: ProviderDetails;
    try {
      details = await fetchSummary("all", args.eventId);
    } catch (e) {
      console.error(`Riassunto ${args.eventId}:`, e instanceof Error ? e.message : e);
      return null;
    }
    await ctx.runMutation(internal.footballMatches.applyPoll, {
      matches: [],
      details: [{ eventId: args.eventId, details }],
      missing: [],
      fetchedAt,
    });
    return null;
  },
});

/**
 * Il drawer di una partita: competizione, stadio, eventi, formazioni e statistiche. `null` se non sono ancora arrivati,
 * o se chi chiede non è nella chat o la chat non ha pinnato nessuna delle due squadre.
 */
export const details = query({
  args: { conversationId: v.id("conversations"), eventId: v.string() },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return null;
    const member = await ctx.db
      .query("members")
      .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", args.conversationId).eq("profileId", me._id))
      .unique();
    if (!member) return null;
    const match = await matchByEvent(ctx, args.eventId);
    if (!match) return null;
    const pins = await ctx.db
      .query("teamPins")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .take(MAX_TEAM_PINS);
    if (!pins.some((pin) => pin.teamId === match.home.teamId || pin.teamId === match.away.teamId)) return null;
    const row = await detailsOf(ctx, match._id);
    if (!row) return null;
    return {
      competition: row.competition ?? null,
      venue: row.venue ?? null,
      events: row.events,
      lineups: row.lineups,
      stats: row.stats,
      fetchedAt: row.fetchedAt,
    };
  },
});
