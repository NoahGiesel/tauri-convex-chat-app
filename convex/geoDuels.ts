import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { pickPlaces, placeById } from "./geoCities";
import {
  DUEL_DEADLINE_MS,
  GRACE_MS,
  INVITE_TTL_MS,
  ROUND_MS,
  distanceKm,
  isLatLng,
  pointsFor,
  type GeoResultSummary,
} from "./geoRules";
import { fail, getProfile, requireMember, requireProfile } from "./model";
import { geoRoundCount, geoZone } from "./schema";

/** Duel passati letti per non ripetere i posti nella chat. */
const USED_PLACES_LIMIT = 300;

type Side = "a" | "b";
type Run = NonNullable<Doc<"geoDuels">["runA"]>;
type Round = Run["rounds"][number];
type Outcome = NonNullable<Doc<"geoDuels">["outcome"]>;
/** I campi di ciascun giocatore: A è chi ha sfidato. */
const RUN_FIELD = { a: "runA", b: "runB" } as const;
const PLAYER_FIELD = { a: "playerA", b: "playerB" } as const;
const OTHER_SIDE = { a: "b", b: "a" } as const;
const side = v.union(v.literal("a"), v.literal("b"));

/** La Duel deadline: 24 ore dopo l'accettazione; null se l'invito non è stato accettato. */
function deadlineOf(duel: Doc<"geoDuels">): number | null {
  return duel.acceptedAt !== undefined ? duel.acceptedAt + DUEL_DEADLINE_MS : null;
}

function sideOf(duel: Doc<"geoDuels">, profileId: Id<"profiles">): Side | null {
  return duel.playerA === profileId ? "a" : duel.playerB === profileId ? "b" : null;
}

/** Il Round aperto e non ancora finito, se c'è: è sempre l'ultimo. */
function roundInProgress(run: Run | undefined): Round | null {
  const last = run?.rounds.at(-1);
  return last && last.endedAt === undefined ? last : null;
}

/** Stato di una Run come lo vede la scheda: da giocare, in corso (anche tra un Round e l'altro) o finita. */
function runState(run: Run | undefined): "toPlay" | "playing" | "finished" {
  return !run ? "toPlay" : run.endedAt !== undefined ? "finished" : "playing";
}

/** Il Duel e il lato di chi chiama, che deve essere uno dei due giocatori. */
async function requirePlayer(ctx: QueryCtx, duelId: Id<"geoDuels">) {
  const me = await requireProfile(ctx);
  const duel = await ctx.db.get("geoDuels", duelId);
  if (!duel) throw fail("game_closed");
  const s = sideOf(duel, me._id);
  if (!s) throw fail("not_member");
  return { duel, side: s };
}

const runPatch = (s: Side, run: Run) => ({ [RUN_FIELD[s]]: run });

const totalPoints = (run: Run) => run.rounds.reduce((sum, r) => sum + (r.points ?? 0), 0);
/** Tempo della Run: la somma dei Round, senza le pause tra un Round e l'altro. */
const runTime = (run: Run) => run.rounds.reduce((sum, r) => sum + ((r.endedAt ?? r.endsAt) - r.startedAt), 0);

/** La Run finita del giocatore, o null se non l'ha aperta o è ancora in corso. */
function finishedRun(duel: Doc<"geoDuels">, s: Side): Run | null {
  const run = duel[RUN_FIELD[s]];
  return run?.endedAt !== undefined ? run : null;
}

/** Chiude il Round in corso con il suo segnaposto (o senza, a tempo scaduto); se era l'ultimo chiude anche la Run. */
async function endRound(ctx: MutationCtx, duel: Doc<"geoDuels">, s: Side, run: Run, ended: Round) {
  const rounds = [...run.rounds.slice(0, -1), ended];
  const last = rounds.length >= duel.places.length;
  await ctx.db.patch("geoDuels", duel._id, runPatch(s, { ...run, rounds, ...(last ? { endedAt: ended.endedAt } : {}) }));
  await closeIfDone(ctx, duel._id);
}

/**
 * Come si chiude il Duel, dalle regole del vincitore. Chi non ha aperto la Run perde per forfeit;
 * se nessuno l'ha aperta il Duel scade senza esito.
 */
function closingOf(duel: Doc<"geoDuels">): { status: "closed"; outcome: Outcome } | { status: "expired" } {
  const a = finishedRun(duel, "a");
  const b = finishedRun(duel, "b");
  const win = (s: Side, reason: Outcome["reason"]) => ({ status: "closed" as const, outcome: { winner: duel[PLAYER_FIELD[s]], reason } });
  if (!a && !b) return { status: "expired" };
  if (!a || !b) return win(a ? "a" : "b", "forfeit");
  if (totalPoints(a) !== totalPoints(b)) return win(totalPoints(a) > totalPoints(b) ? "a" : "b", "morePoints");
  if (runTime(a) !== runTime(b)) return win(runTime(a) < runTime(b) ? "a" : "b", "fasterRun");
  return { status: "closed", outcome: { reason: "fasterRun" } }; // stessi punti e stesso tempo al millisecondo: pareggio
}

/** Chiude il Duel con il suo esito e lo annuncia in chat con un messaggio senza autore. */
async function closeDuel(ctx: MutationCtx, duel: Doc<"geoDuels">) {
  await ctx.db.patch("geoDuels", duel._id, { ...closingOf(duel), finishedAt: Date.now() });
  const members = await membersOf(ctx, duel.conversationId);
  await postDuelMessage(ctx, members, { conversationId: duel.conversationId, kind: "game", body: "geo", geoDuelId: duel._id });
}

/**
 * Dopo la fine di un Round e alla Duel deadline: il Duel si chiude subito se anche l'altra Run è finita,
 * oppure se la deadline è passata e nessun Round è più in corso. Alla deadline una Run aperta ma non finita
 * finisce lì: i Round non giocati valgono 0.
 */
async function closeIfDone(ctx: MutationCtx, duelId: Id<"geoDuels">) {
  const duel = await ctx.db.get("geoDuels", duelId);
  if (!duel || duel.status !== "open") return;
  if (runState(duel.runA) === "finished" && runState(duel.runB) === "finished") return await closeDuel(ctx, duel);
  const deadline = deadlineOf(duel);
  if (deadline === null || Date.now() < deadline || roundInProgress(duel.runA) || roundInProgress(duel.runB)) return;
  const patch: Partial<Doc<"geoDuels">> = {};
  for (const s of ["a", "b"] as const) {
    const run = duel[RUN_FIELD[s]];
    if (run && run.endedAt === undefined) patch[RUN_FIELD[s]] = { ...run, endedAt: deadline };
  }
  if (Object.keys(patch).length > 0) await ctx.db.patch("geoDuels", duel._id, patch);
  await closeDuel(ctx, { ...duel, ...patch });
}

/** Il Geo Duel ancora in corso nella chat (invito in attesa o Duel aperto), se c'è. Non legge mai gli altri giochi. */
async function activeDuel(ctx: QueryCtx, conversationId: Id<"conversations">): Promise<Doc<"geoDuels"> | null> {
  for (const status of ["invite", "open"] as const) {
    const duel = await ctx.db
      .query("geoDuels")
      .withIndex("by_conversation_and_status", (q) => q.eq("conversationId", conversationId).eq("status", status))
      .first();
    if (duel) return duel;
  }
  return null;
}

/** I Duel chiusi di una chat, dal più recente. */
function closedDuels(ctx: QueryCtx, conversationId: Id<"conversations">) {
  return ctx.db
    .query("geoDuels")
    .withIndex("by_conversation_and_status", (q) => q.eq("conversationId", conversationId).eq("status", "closed"))
    .order("desc");
}

async function membersOf(ctx: QueryCtx, conversationId: Id<"conversations">) {
  return await ctx.db
    .query("members")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .take(5);
}

/** Aggiunge alla chat un messaggio del Duel e la fa salire nell'elenco; per chi scrive il messaggio è già letto. */
async function postDuelMessage(ctx: MutationCtx, members: Doc<"members">[], message: Omit<Doc<"messages">, "_id" | "_creationTime">) {
  const now = Date.now();
  await ctx.db.insert("messages", message);
  await ctx.db.patch("conversations", message.conversationId, { lastMessageAt: now });
  for (const m of members) {
    await ctx.db.patch("members", m._id, m.profileId === message.authorId ? { lastMessageAt: now, lastReadAt: now } : { lastMessageAt: now });
  }
}

/** `/geo`: sfida l'altra persona di una chat diretta a un Geo Duel. I posti li sceglie il server, adesso, per tutti e due. */
export const start = mutation({
  args: { conversationId: v.id("conversations"), zone: geoZone, rounds: geoRoundCount },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (!conversation || conversation.kind !== "direct") throw fail("game_direct_only");
    const members = await membersOf(ctx, args.conversationId);
    const peer = members.find((m) => m.profileId !== me._id);
    if (!peer) throw fail("game_direct_only");
    if (await activeDuel(ctx, args.conversationId)) throw fail("geo_in_progress");

    // Niente posti già giocati in questa chat e Zone (Duel accettati), finché ce ne sono di nuovi.
    const past = await ctx.db
      .query("geoDuels")
      .withIndex("by_conversation_and_zone", (q) => q.eq("conversationId", args.conversationId).eq("zone", args.zone))
      .order("desc")
      .take(USED_PLACES_LIMIT);
    const used = new Set(past.flatMap((d) => (d.acceptedAt !== undefined ? d.places : [])));
    const places = pickPlaces(args.zone, args.rounds, used);

    const createdAt = Date.now();
    const duelId = await ctx.db.insert("geoDuels", {
      conversationId: args.conversationId,
      playerA: me._id,
      playerB: peer.profileId,
      zone: args.zone,
      rounds: args.rounds,
      places,
      status: "invite",
      createdAt,
    });
    await postDuelMessage(ctx, members, { conversationId: args.conversationId, authorId: me._id, kind: "game", body: "geo", geoDuelId: duelId });
    await ctx.scheduler.runAt(createdAt + INVITE_TTL_MS, internal.geoDuels.expireInvite, { duelId });
    return duelId;
  },
});

/** Lo sfidato accetta o rifiuta; chi ha sfidato può ritirare l'invito finché non è accettato. */
export const respond = mutation({
  args: { duelId: v.id("geoDuels"), action: v.union(v.literal("accept"), v.literal("decline"), v.literal("withdraw")) },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const duel = await ctx.db.get("geoDuels", args.duelId);
    if (!duel) throw fail("game_closed");
    await requireMember(ctx, duel.conversationId, me._id);
    if (duel.status !== "invite") throw fail("game_closed");

    const now = Date.now();
    if (args.action === "withdraw") {
      if (duel.playerA !== me._id) throw fail("not_member");
      await ctx.db.patch("geoDuels", duel._id, { status: "withdrawn", finishedAt: now });
      return;
    }
    if (duel.playerB !== me._id) throw fail("not_member");
    if (args.action === "decline") {
      await ctx.db.patch("geoDuels", duel._id, { status: "declined", finishedAt: now });
      return;
    }
    await ctx.db.patch("geoDuels", duel._id, { status: "open", acceptedAt: now });
    await ctx.scheduler.runAt(now + DUEL_DEADLINE_MS, internal.geoDuels.closeAtDeadline, { duelId: duel._id });
  },
});

/** Alla Duel deadline il Duel si chiude; un Round ancora in corso finisce prima il suo Round timer, poi chiude lui. */
export const closeAtDeadline = internalMutation({
  args: { duelId: v.id("geoDuels") },
  handler: async (ctx, args) => {
    await closeIfDone(ctx, args.duelId);
  },
});

/** Un invito rimasto senza risposta per 24 ore scade, senza messaggi in chat. */
export const expireInvite = internalMutation({
  args: { duelId: v.id("geoDuels") },
  handler: async (ctx, args) => {
    const duel = await ctx.db.get("geoDuels", args.duelId);
    if (!duel || duel.status !== "invite") return;
    await ctx.db.patch("geoDuels", duel._id, { status: "expired", finishedAt: Date.now() });
  },
});

/** Apre il prossimo Round di chi chiama (se non ce n'è già uno in corso): da qui parte il Round timer. */
export const openRound = mutation({
  args: { duelId: v.id("geoDuels") },
  handler: async (ctx, args) => {
    const { duel, side: s } = await requirePlayer(ctx, args.duelId);
    const now = Date.now();
    // Un Round si può aprire fino alla Duel deadline.
    const deadline = deadlineOf(duel);
    if (duel.status !== "open" || deadline === null || now >= deadline) throw fail("game_closed");
    const run = duel[RUN_FIELD[s]] ?? { rounds: [] };
    if (run.endedAt !== undefined || run.rounds.length >= duel.places.length) throw fail("geo_run_over");
    if (roundInProgress(run)) return;
    const endsAt = now + ROUND_MS;
    const index = run.rounds.length;
    await ctx.db.patch("geoDuels", duel._id, runPatch(s, { ...run, rounds: [...run.rounds, { startedAt: now, endsAt }] }));
    await ctx.scheduler.runAt(endsAt + GRACE_MS, internal.geoDuels.timeoutRound, { duelId: duel._id, side: s, index });
  },
});

/** Conferma il segnaposto del Round in corso: distanza e punti li calcola il server. */
export const guess = mutation({
  args: { duelId: v.id("geoDuels"), index: v.number(), lat: v.number(), lng: v.number() },
  handler: async (ctx, args) => {
    const { duel, side: s } = await requirePlayer(ctx, args.duelId);
    const now = Date.now();
    const run = duel[RUN_FIELD[s]];
    const round = roundInProgress(run);
    // L'indice evita che un clic tardivo finisca nel Round dopo.
    if (duel.status !== "open" || !run || !round || run.rounds.length - 1 !== args.index || now > round.endsAt + GRACE_MS) throw fail("geo_run_over");
    const pin = { lat: args.lat, lng: args.lng };
    if (!isLatLng(pin)) throw fail("geo_bad_pin");
    const km = distanceKm(pin, placeById(duel.places[args.index]));
    await endRound(ctx, duel, s, run, { ...round, endedAt: Math.min(now, round.endsAt), pin, km, points: pointsFor(km, duel.zone) });
  },
});

/** Arrendersi: il Round in corso vale 0 e la Run finisce subito; i Round non giocati valgono 0. */
export const giveUp = mutation({
  args: { duelId: v.id("geoDuels") },
  handler: async (ctx, args) => {
    const { duel, side: s } = await requirePlayer(ctx, args.duelId);
    const now = Date.now();
    const run = duel[RUN_FIELD[s]];
    if (duel.status !== "open" || !run || run.endedAt !== undefined) throw fail("geo_run_over");
    const rounds = run.rounds.map((r) => (r.endedAt === undefined ? { ...r, endedAt: Math.min(now, r.endsAt), points: 0 } : r));
    await ctx.db.patch("geoDuels", duel._id, runPatch(s, { rounds, endedAt: now, gaveUp: true }));
    await closeIfDone(ctx, duel._id);
  },
});

/** Allo scadere del Round timer (più la tolleranza) chiude senza segnaposto il Round ancora in corso. */
export const timeoutRound = internalMutation({
  args: { duelId: v.id("geoDuels"), side, index: v.number() },
  handler: async (ctx, args) => {
    const duel = await ctx.db.get("geoDuels", args.duelId);
    const run = duel?.[RUN_FIELD[args.side]];
    const round = roundInProgress(run);
    if (!duel || duel.status !== "open" || !run || !round || run.rounds.length - 1 !== args.index) return;
    await endRound(ctx, duel, args.side, run, { ...round, endedAt: round.endsAt, points: 0 });
  },
});

/** Un posto come lo vede il client: nomi in tutte le lingue, paese e, se serve, le coordinate. */
function placeView(id: number, withCoords: boolean) {
  const p = placeById(id);
  return { names: p.names, country: p.country, ...(withCoords ? { lat: p.lat, lng: p.lng } : {}) };
}

/** Un Round finito come lo mostrano la finestra e la scheda chiusa. */
function roundResult(r: Round | undefined) {
  if (!r || r.endedAt === undefined) return null;
  return { pin: r.pin ?? null, km: r.km ?? null, points: r.points ?? 0, timeMs: r.endedAt - r.startedAt };
}

/** Il lato di chi ha vinto, o null per un pareggio o un Duel senza esito. */
function winnerSideOf(duel: Doc<"geoDuels">): Side | null {
  const winner = duel.outcome?.winner;
  return winner ? sideOf(duel, winner) : null;
}

/** Il Duel è finito dopo l'accettazione: chiuso con un esito, o scaduto senza che nessuno giocasse. */
const isOver = (duel: Doc<"geoDuels">) => duel.status === "closed" || (duel.status === "expired" && duel.acceptedAt !== undefined);

/** Il risultato completo, solo a Duel chiuso: i posti, i Round di tutti e due e l'esito. */
function resultOf(duel: Doc<"geoDuels">) {
  if (duel.status !== "closed") return null;
  const a = finishedRun(duel, "a");
  const b = finishedRun(duel, "b");
  return {
    outcome: duel.outcome ? { winner: winnerSideOf(duel), reason: duel.outcome.reason } : null,
    totals: { a: a ? totalPoints(a) : null, b: b ? totalPoints(b) : null },
    times: { a: a ? runTime(a) : null, b: b ? runTime(b) : null },
    rounds: duel.places.map((id, i) => ({ place: placeView(id, true), a: roundResult(a?.rounds[i]), b: roundResult(b?.rounds[i]) })),
  };
}

/** Il risultato in breve di un Duel finito: chi vince, perché, e i punti. */
function resultSummaryOf(duel: Doc<"geoDuels">, winnerName: string | null): GeoResultSummary {
  const winnerSide = winnerSideOf(duel);
  const points = (s: Side | null) => {
    const run = s ? finishedRun(duel, s) : null;
    return run ? totalPoints(run) : null;
  };
  // In un pareggio i punti sono gli stessi: si mostrano quelli di A.
  return {
    status: duel.status === "closed" ? "closed" : "expired",
    winnerName,
    reason: duel.outcome?.reason ?? null,
    winnerPoints: points(winnerSide ?? (duel.status === "closed" ? "a" : null)),
    otherPoints: points(winnerSide ? OTHER_SIDE[winnerSide] : duel.status === "closed" ? "b" : null),
  };
}

/** Per la notifica del messaggio di chiusura. Null se il Duel non è finito dopo l'accettazione. */
export async function geoResultSummary(ctx: QueryCtx, duelId: Id<"geoDuels">): Promise<GeoResultSummary | null> {
  const duel = await ctx.db.get("geoDuels", duelId);
  if (!duel || !isOver(duel)) return null;
  const winner = duel.outcome?.winner;
  return resultSummaryOf(duel, winner ? ((await ctx.db.get("profiles", winner))?.name ?? "?") : null);
}

/**
 * La rivincita si offre solo sull'ultimo Duel chiuso della chat (un Duel più recente rifiutato, ritirato o
 * scaduto non conta) e mai mentre nella chat c'è un invito o un Duel aperto.
 */
async function canRematch(ctx: QueryCtx, duel: Doc<"geoDuels">): Promise<boolean> {
  if (duel.status !== "closed") return false;
  const latestClosed = await closedDuels(ctx, duel.conversationId).first();
  return latestClosed?._id === duel._id && (await activeDuel(ctx, duel.conversationId)) === null;
}

/** La scheda del Duel per chi è nella chat. Finché il Duel non è chiuso non contiene mai i posti. */
export const get = query({
  args: { duelId: v.id("geoDuels") },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return null;
    const duel = await ctx.db.get("geoDuels", args.duelId);
    if (!duel) return null;
    const member = await ctx.db
      .query("members")
      .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", duel.conversationId).eq("profileId", me._id))
      .unique();
    if (!member) return null;

    const s = sideOf(duel, me._id);
    const [a, b] = await Promise.all([ctx.db.get("profiles", duel.playerA), ctx.db.get("profiles", duel.playerB)]);
    const nameA = a?.name ?? "?";
    const nameB = b?.name ?? "?";
    const myRun = s ? duel[RUN_FIELD[s]] : undefined;
    return {
      _id: duel._id,
      conversationId: duel.conversationId,
      status: duel.status,
      mySide: s,
      nameA,
      nameB,
      zone: duel.zone,
      rounds: duel.rounds,
      createdAt: duel.createdAt,
      expiresAt: duel.createdAt + INVITE_TTL_MS,
      acceptedAt: duel.acceptedAt ?? null,
      deadline: deadlineOf(duel),
      /** Solo lo stato e quanti Round ha aperto chi guarda: mai i posti qui. */
      myRun: s ? { state: runState(myRun), roundsOpened: myRun?.rounds.length ?? 0 } : null,
      /** Lo stato di ogni Run: mai un risultato finché il Duel è aperto. */
      players: { a: runState(duel.runA), b: runState(duel.runB) },
      result: resultOf(duel),
      /** Rivincita: un invito normale con la stessa Zone e gli stessi Round, da chiunque dei due la prema. */
      canRematch: s !== null && (await canRematch(ctx, duel)),
      /** La riga di chiusura in breve, per il messaggio senza autore in chat. */
      summary: isOver(duel) ? resultSummaryOf(duel, { a: nameA, b: nameB, none: null }[winnerSideOf(duel) ?? "none"]) : null,
      serverNow: Date.now(),
    };
  },
});

/**
 * La Run di chi chiede, per la finestra della Run: i suoi Round con il nome del posto (da quando il Round è aperto),
 * le coordinate e il risultato (da quando è finito). L'altro giocatore compare solo a Duel chiuso.
 */
export const myRun = query({
  args: { duelId: v.id("geoDuels") },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return null;
    const duel = await ctx.db.get("geoDuels", args.duelId);
    const s = duel ? sideOf(duel, me._id) : null;
    if (!duel || !s) return null;
    const run = duel[RUN_FIELD[s]];
    const other = OTHER_SIDE[s];
    const opponent = await ctx.db.get("profiles", duel[PLAYER_FIELD[other]]);
    const result = resultOf(duel);
    return {
      status: duel.status,
      zone: duel.zone,
      totalRounds: duel.places.length,
      mySide: s,
      opponentName: opponent?.name ?? "?",
      opponentState: runState(duel[RUN_FIELD[other]]),
      deadline: deadlineOf(duel),
      run: run
        ? {
            endedAt: run.endedAt ?? null,
            gaveUp: run.gaveUp ?? false,
            rounds: run.rounds.map((r, i) => ({
              startedAt: r.startedAt,
              endsAt: r.endsAt,
              place: placeView(duel.places[i], r.endedAt !== undefined),
              result: roundResult(r),
            })),
          }
        : null,
      /** A Duel chiuso: i Round di tutti e due e l'esito. */
      result,
      serverNow: Date.now(),
    };
  },
});

/** Duel recenti mostrati nell'elenco della scheda "Giochi". */
const HISTORY_LIMIT = 50;
/** Duel letti per le statistiche, dal più recente. */
const STATS_LIMIT = 500;

/**
 * Duel chiusi di una chat e statistiche, per la scheda "Giochi" di Media. Contano i Duel chiusi, forfeit compresi;
 * per ogni giocatore le vittorie e la media dei punti per Round.
 */
export const history = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return null;
    const member = await ctx.db
      .query("members")
      .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", args.conversationId).eq("profileId", me._id))
      .unique();
    if (!member) return null;

    const closed = await closedDuels(ctx, args.conversationId).take(STATS_LIMIT);

    const names = new Map<Id<"profiles">, string>();
    const nameOf = async (id: Id<"profiles">) => {
      if (!names.has(id)) names.set(id, (await ctx.db.get("profiles", id))?.name ?? "?");
      return names.get(id)!;
    };
    const players = new Map<Id<"profiles">, { profileId: Id<"profiles">; name: string; wins: number; rounds: number; points: number }>();
    const entry = async (id: Id<"profiles">) => {
      if (!players.has(id)) players.set(id, { profileId: id, name: await nameOf(id), wins: 0, rounds: 0, points: 0 });
      return players.get(id)!;
    };
    const pointsOf = (duel: Doc<"geoDuels">, s: Side) => {
      const run = finishedRun(duel, s);
      return run ? totalPoints(run) : null;
    };

    let draws = 0;
    for (const duel of closed) {
      for (const s of ["a", "b"] as const) {
        const points = pointsOf(duel, s);
        if (points === null) continue;
        const player = await entry(duel[PLAYER_FIELD[s]]);
        player.rounds += duel.places.length;
        player.points += points;
      }
      if (duel.outcome?.winner) (await entry(duel.outcome.winner)).wins += 1;
      else draws += 1;
    }

    const recent = await Promise.all(
      closed.slice(0, HISTORY_LIMIT).map(async (duel) => ({
        _id: duel._id,
        finishedAt: duel.finishedAt ?? duel._creationTime,
        nameA: await nameOf(duel.playerA),
        nameB: await nameOf(duel.playerB),
        pointsA: pointsOf(duel, "a"),
        pointsB: pointsOf(duel, "b"),
        zone: duel.zone,
        rounds: duel.rounds,
        winnerSide: winnerSideOf(duel),
      })),
    );
    return {
      total: closed.length,
      draws,
      players: [...players.values()].map(({ profileId, name, wins, rounds, points }) => ({
        profileId,
        name,
        wins,
        averagePoints: rounds > 0 ? points / rounds : null,
      })),
      recent,
    };
  },
});
