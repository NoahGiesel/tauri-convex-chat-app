// Copied into the stage's convex/ as e2eSeed.ts. It never lives in the repo's convex/, because `npx convex deploy` works from there.
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { parseSchedule, parseScoreboard, parseStandings } from "./espn";
import { mergeCompetitions } from "./footballTeamSchedules";

/** By email, because IDs and tokens differ between runs. A Seed holds three profiles, so a scan is enough. */
async function profileByEmail(ctx: MutationCtx, email: string) {
  for await (const profile of ctx.db.query("profiles")) {
    if (profile.email === email) return profile;
  }
  throw new Error(`no profile for ${email}`);
}

/** Public functions cannot make the random avatar index deterministic. */
export const fixAvatars = internalMutation({
  args: {},
  handler: async (ctx) => {
    // By email, because IDs and tokens differ between runs.
    const profiles = await ctx.db.query("profiles").withIndex("by_tokenIdentifier").collect();
    profiles.sort((a, b) => a.email.localeCompare(b.email));
    for (const [i, profile] of profiles.entries()) {
      await ctx.db.patch("profiles", profile._id, { avatarIndex: i % 3 });
    }
  },
});

/** Public functions only make invites that are valid for 7 days. */
export const expiredInvite = internalMutation({
  args: { token: v.string(), createdByEmail: v.string() },
  handler: async (ctx, args) => {
    const profile = await profileByEmail(ctx, args.createdByEmail);
    await ctx.db.insert("invites", { token: args.token, createdBy: profile._id, expiresAt: Date.now() - 60 * 60 * 1000 });
  },
});

/**
 * The public way to look away, `setInvisible`, also makes the user invisible, and an invisible user's
 * heartbeat does nothing. A Scripted user could then never come online again.
 */
export const setLastSeenAt = internalMutation({
  args: { email: v.string(), lastSeenAt: v.number() },
  handler: async (ctx, args) => {
    const profile = await profileByEmail(ctx, args.email);
    await ctx.db.patch("profiles", profile._id, { lastSeenAt: args.lastSeenAt });
  },
});

/**
 * The server picks a Wordle Duel's word at random, so a test sets the open Duel's word after acceptance to one it knows.
 * A scan, because a test plays one Duel on a fresh Seed, and no index has the status alone.
 */
export const setWordleWord = internalMutation({
  args: { word: v.string() },
  handler: async (ctx, args) => {
    const open = [];
    for await (const duel of ctx.db.query("wordleDuels")) {
      if (duel.status === "open") open.push(duel);
    }
    if (open.length !== 1) throw new Error(`expected one open Wordle Duel, found ${open.length}`);
    await ctx.db.patch("wordleDuels", open[0]._id, { word: args.word });
  },
});

/**
 * Scheduled functions not yet done, such as the next-match lookups that `teamPins.add` starts.
 * A Seed waits until there are none before its snapshot, so no lookup lands after a Reset.
 */
export const pendingJobs = internalQuery({
  args: {},
  handler: async (ctx) => {
    let pending = 0;
    for await (const job of ctx.db.system.query("_scheduled_functions")) {
      if (job.state.kind === "pending" || job.state.kind === "inProgress") pending++;
    }
    return pending;
  },
});

/**
 * What no public function or next-match lookup gives: a pinned team's finished or postponed last match, and a live
 * match whose score stopped arriving (an old `fetchedAt`). The events are canned ESPN ones, read by the app's own parser.
 */
export const seedFootballMatches = internalMutation({
  args: {
    matches: v.array(v.object({ league: v.string(), event: v.any(), fetchedAt: v.number() })),
    last: v.array(v.object({ teamId: v.string(), eventId: v.string() })),
    next: v.array(v.object({ teamId: v.string(), eventId: v.string() })),
  },
  handler: async (ctx, args) => {
    const ids = new Map<string, Id<"footballMatches">>();
    for (const { league, event, fetchedAt } of args.matches) {
      const [match] = parseScoreboard({ events: [event] }, league);
      const existing = await ctx.db
        .query("footballMatches")
        .withIndex("by_eventId", (q) => q.eq("eventId", match.eventId))
        .unique();
      if (existing) await ctx.db.delete("footballMatches", existing._id);
      ids.set(match.eventId, await ctx.db.insert("footballMatches", { ...match, fetchedAt }));
    }
    const point = async (teamId: string, eventId: string, field: "lastMatchId" | "nextMatchId") => {
      const team = await ctx.db
        .query("footballTeams")
        .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
        .unique();
      const matchId = ids.get(eventId);
      if (!team || !matchId) throw new Error(`no team ${teamId} or match ${eventId} to seed`);
      await ctx.db.patch("footballTeams", team._id, { [field]: matchId });
    };
    for (const { teamId, eventId } of args.last) await point(teamId, eventId, "lastMatchId");
    for (const { teamId, eventId } of args.next) await point(teamId, eventId, "nextMatchId");
  },
});

/**
 * The drawer's data no public function gives in a run: the schedules of the pinned teams and the tables of the
 * competitions the stub serves. Both come as canned ESPN answers, read by the app's own parsers, so the Seed
 * cannot disagree with what the stub serves. Written last, after the pins' own refreshes have settled.
 */
export const seedFootballSchedule = internalMutation({
  args: {
    schedules: v.array(v.object({ teamId: v.string(), results: v.any(), fixtures: v.any() })),
    standings: v.array(v.object({ league: v.string(), json: v.any() })),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    for (const { teamId, results, fixtures } of args.schedules) {
      const played = parseSchedule(results, teamId);
      const scheduled = parseSchedule(fixtures, teamId);
      const row = {
        teamId,
        results: played.matches,
        fixtures: scheduled.matches,
        competitions: mergeCompetitions([played.competitions, scheduled.competitions]),
        fetchedAt: args.fetchedAt,
      };
      const existing = await ctx.db
        .query("footballTeamSchedules")
        .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
        .unique();
      if (existing) await ctx.db.replace("footballTeamSchedules", existing._id, row);
      else await ctx.db.insert("footballTeamSchedules", row);
    }
    for (const { league, json } of args.standings) {
      const table = parseStandings(json);
      const row = { league, ...table, fetchedAt: args.fetchedAt };
      const existing = await ctx.db
        .query("footballStandings")
        .withIndex("by_league_and_season", (q) => q.eq("league", league).eq("season", table.season))
        .unique();
      if (existing) await ctx.db.replace("footballStandings", existing._id, row);
      else await ctx.db.insert("footballStandings", row);
    }
  },
});
