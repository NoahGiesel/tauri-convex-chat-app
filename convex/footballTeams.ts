import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, query, type QueryCtx } from "./_generated/server";
import { CLUB_COMPETITIONS, fetchTeamList, NATIONAL_TEAMS_LEAGUE } from "./espn";
import { foldText, matchRank, searchKeys } from "./footballSearch";
import { getProfile } from "./model";

/** Più di quante squadre l'indice possa mai avere (oggi circa 380). */
const MAX_TEAMS = 2000;
const MAX_RESULTS = 8;

const teamValidator = v.object({
  teamId: v.string(),
  name: v.string(),
  shortName: v.string(),
  abbreviation: v.string(),
  logo: v.optional(v.string()),
  competition: v.optional(v.string()),
  national: v.boolean(),
});

/** La riga dell'indice di una squadra, anche se non è più nelle liste. */
export async function teamRow(ctx: QueryCtx, teamId: string): Promise<Doc<"footballTeams"> | null> {
  return await ctx.db
    .query("footballTeams")
    .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
    .unique();
}

/**
 * Ricostruisce l'indice di `/calcio` dalle liste ESPN: i club delle competizioni coperte
 * (il primo campionato in cui compaiono dà la competizione) e tutte le nazionali.
 * Se una lista non arriva, l'indice resta com'era.
 */
export const rebuildIndex = internalAction({
  args: {},
  handler: async (ctx) => {
    const teams = new Map<string, typeof teamValidator.type>();
    for (const { league, label } of CLUB_COMPETITIONS) {
      for (const team of await fetchTeamList(league)) {
        if (!teams.has(team.teamId)) teams.set(team.teamId, { ...team, competition: label, national: false });
      }
    }
    for (const team of await fetchTeamList(NATIONAL_TEAMS_LEAGUE)) {
      if (!teams.has(team.teamId)) teams.set(team.teamId, { ...team, national: true });
    }
    await ctx.runMutation(internal.footballTeams.replaceIndex, { teams: [...teams.values()] });
    return null;
  },
});

/** Scrive l'indice: aggiorna le squadre arrivate e toglie dalla ricerca quelle che mancano. */
export const replaceIndex = internalMutation({
  args: { teams: v.array(teamValidator) },
  handler: async (ctx, args) => {
    const incoming = new Set(args.teams.map((team) => team.teamId));
    for (const team of args.teams) {
      const row = { ...team, keys: searchKeys(team), listed: true };
      const existing = await ctx.db
        .query("footballTeams")
        .withIndex("by_teamId", (q) => q.eq("teamId", team.teamId))
        .unique();
      if (existing) await ctx.db.patch("footballTeams", existing._id, row);
      else await ctx.db.insert("footballTeams", row);
    }
    const listed = await ctx.db
      .query("footballTeams")
      .withIndex("by_listed", (q) => q.eq("listed", true))
      .take(MAX_TEAMS);
    for (const row of listed) {
      if (!incoming.has(row.teamId)) await ctx.db.patch("footballTeams", row._id, { listed: false });
    }
  },
});

/** Le squadre che corrispondono al testo di `/calcio`, dalla migliore. */
export const search = query({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return [];
    const text = foldText(args.text);
    if (text.length < 2) return [];

    const rows = await ctx.db
      .query("footballTeams")
      .withIndex("by_listed", (q) => q.eq("listed", true))
      .take(MAX_TEAMS);
    return rows
      .map((row) => ({ row, rank: matchRank(row.keys, text) }))
      .filter((hit): hit is { row: (typeof rows)[number]; rank: number } => hit.rank !== null)
      .sort((a, b) => a.rank - b.rank || a.row.name.localeCompare(b.row.name))
      .slice(0, MAX_RESULTS)
      .map(({ row }) => ({
        teamId: row.teamId,
        name: row.name,
        shortName: row.shortName,
        abbreviation: row.abbreviation,
        logo: row.logo ?? null,
        competition: row.competition ?? null,
        national: row.national,
      }));
  },
});
