# Which free football API can feed Team pins?

Research for issue #100 on the map #99 "Pin football teams with a live Match bar in direct chats".
Throwaway branch, never merged. Researched on 2026-11-08 (the 2026/27 season is in progress).

## Answer

**Use Highlightly (Basic plan, free) as the only source.** It is the only free tier found that
serves the **current season** with **live scores, events, lineups and match stats** for every
target competition. It has one ID space, so there is no mapping of teams between providers.

- **Coverage:** the top 5 leagues, Champions League, Europa League, Conference League, World Cup
  and Euros are all listed. No document limits the free plan by league or season. A third-party
  developer reports the free key returning the current 2026/27 season with full detail.
- **Freshness:** the match list and live events refresh **once a minute**. Stats refresh every
  5 minutes, and lineups every 15 minutes.
- **Detail panel on the free tier:** events, lineups and stats are all documented, and none is
  marked paid-only. The docs never list the stats by name, though. The marketing page names
  possession, shots on target, corners, fouls and cards, but **not offsides or total shots**.
  Those rows may be missing, and are then hidden by the "no data, no section" rule. Every free
  response also carries the notice "Some results might be hidden with FREE tier", with no word
  on what gets hidden. Check that with a real key before the spec is final.
- **The catch is the quota: 100 requests per day** (no per-minute limit). That carries the Match
  bar at **2-minute polling for one kick-off window a day**, or **3-minute polling for two**. A
  Champions League night with pinned teams in both kick-off slots does not fit at 2 minutes. Nine
  matches each polled on its own does not fit at all (see [Request budget](#request-budget)). On
  the free tier the backend must:
  - poll one list call per competition and day, not one call per match;
  - fetch details only while someone has the detail panel open;
  - read the `x-ratelimit-requests-remaining` header and stretch the interval as the quota runs
    low.

  The 1-2 minute live delay from the map holds only on days with one pinned kick-off window.
  **This may change the map's "Live delay" decision.**

**Ruled out:**

- **API-Football (api-sports.io):** its free plan does not cover the current season. Requests
  fail with "Free plans do not have access to this season, try from 2022 to 2024."
- **football-data.org:** free scores are delayed (how long is undocumented). It has no Europa
  League or Conference League, and no events, lineups or stats on the free tier.
- **TheSportsDB:** free team search is locked to "Arsenal", and there are no livescores without
  paying.
- **Sportmonks:** the free plan has only the Danish Superliga and the Scottish Premiership.

**Fallback worth keeping in mind:** football-data.org has no daily cap, only 10 calls a minute.
It could carry the bar's score for the top 5 leagues, Champions League, World Cup and Euros at
any number of matches, but only at its unknown delay. That would need two providers and name
matching between them, so it is not recommended unless the Highlightly quota proves too small in
practice.

**Cheap paid upgrade (information only):** Highlightly Pro at **$9.49/month** gives 7,500
requests a day. That carries all 9 Champions League matches polled one by one every minute
(about 1,100 calls a night) with room to spare.

## How to read this

Every claim carries one of these labels:

- **[read]**: read on the provider's own page, which is linked.
- **[read, via search]**: the provider's own page answers 403 to automated fetches
  (api-football.com, api-sports.io), so the text was read only in search-engine extracts of those
  official pages. Trust it a little less.
- **[third-party]**: an independent developer's report, not the provider.
- **[inferred]**: follows from what was read, but was not observed.

Nothing was run against any API, and no account or key was created. Terms statements are a
reading of the terms, not legal advice.

## Candidates

### Highlightly (highlightly.net): recommended

| Point | Finding |
|---|---|
| Free plan | "BASIC", $0/month, "100 requests per day", "No rate limit" [read: [football-api](https://highlightly.net/football-api/)]. "every core feature included, no credit card required" [read: same page]. |
| Coverage | "950+ leagues". The coverage list names Europa League, Conference League, FIFA World Cup and UEFA Euro, and the FAQ names the top 5 leagues and Champions League [read: [football-api](https://highlightly.net/football-api/)]. No page restricts leagues or seasons by plan. The only documented free-plan limits are on highlights, odds and geo-restriction checks [read: [docs](https://highlightly.net/football-api/documentation/), [pagination](https://highlightly.net/football-api/documentation/getting-started/pagination/)]. |
| Current season | Not stated by the provider. A developer who switched to Highlightly after API-Football refused the current season reports it "returns the current 2026/27 season with full detail", tested on Real Madrid 4-1 RB Leipzig [third-party: [onibsport PR #16](https://github.com/onimisib93-Bello/onibsport/pull/16)]. |
| Live score | `GET /matches` has `state.description`, `state.clock` ("Current minute of the match") and `state.score.current` / `state.score.penalties`. "Refresh interval: Once a minute" [read: [matches](https://highlightly.net/football-api/documentation/matches/)]. |
| Events | `GET /events/{matchId}`: goals, own goals, penalties, missed penalties, yellow and red cards, substitutions and VAR decisions, each with `time` (e.g. "45+1"), `player`, `assist` and `team`. "The feed refreshes once a minute." [read: [events](https://highlightly.net/football-api/documentation/events/)] |
| Lineups | `GET /lineups/{matchId}`: `formation` (e.g. "4-2-3-1"), `initialLineup` as rows from the goalkeeper forward, and `substitutes` as the bench. Each player has name, number and position. Available from 40 minutes before kick-off to 120 minutes after, and refreshed every 15 minutes [read: [lineups](https://highlightly.net/football-api/documentation/lineups/)]. |
| Stats | `GET /statistics/{matchId}`: a list of `{displayName, value}`. The docs show only "Shots accuracy" as an example. They refresh "Once every 5 minutes" and "trail play by up to that long" [read: [statistics](https://highlightly.net/football-api/documentation/statistics/)]. Marketing names "Possession, shots on target, corners, fouls, cards, passes completed" [read: [football-api](https://highlightly.net/football-api/)]. Offsides and total shots are not named. |
| One call for details | `GET /matches/{id}` always returns `state`, `events` and `statistics`, but no lineups (those have their own endpoint) [read: [match by id](https://highlightly.net/football-api/documentation/matches/by-id/)]. A detail refresh is 1 call, plus 1 for lineups [inferred]. |
| Free-tier caveat | Responses carry `plan: {tier, message}`, and the documented example message reads "Some results might be hidden with FREE tier" [read: [teams](https://highlightly.net/football-api/documentation/teams/), [matches](https://highlightly.net/football-api/documentation/matches/)]. What is hidden is not documented. |
| Quota visibility | Headers `x-ratelimit-requests-limit` and `x-ratelimit-requests-remaining`. "At zero, requests fail until the daily quota resets." The reset time is not stated [read: [pagination](https://highlightly.net/football-api/documentation/getting-started/pagination/)]. Each page of a paged result costs one request [read: same]. |
| Team search | `GET /teams?name=…&type=club\|national&limit&offset`, returning `id`, `name`, `logo` and `type` [read: [teams](https://highlightly.net/football-api/documentation/teams/)]. **Whether `name` matches exactly or partially is not documented** [read: same; [conventions](https://highlightly.net/sport-api/documentation/conventions/)]. "Inter", "Milan" and "Atletico" are therefore unverified. The `type=national` filter is useful for World Cup and Euros teams. |
| Next match | `GET /matches` takes `homeTeamId` / `awayTeamId` (or `homeTeamName` / `awayTeamName`), `leagueId`, `season`, `date` and `timezone`. There is **no single "team" filter**, so one team's fixtures cost two calls (home and away) [read: [matches](https://highlightly.net/football-api/documentation/matches/)]. |
| Terms | "You may store the data provided by the Service and use it to build and operate Your own applications". It is forbidden to "sell, resell, license, sublicense, rent, or otherwise supply the data", including "through Your own API, data feed". It is also forbidden to circumvent rate limits. The free plan "provides limited access and is not subject to the same terms as paid plans". The terms ask for no attribution. Using logos commercially is the user's own responsibility [read: [terms](https://highlightly.net/terms/)]. A private app showing data to a few friends fits "build and operate Your own applications" [inferred]. Keep the key in a Convex environment variable and never ship it to the client [inferred]. |
| Cheapest paid | PRO $9.49/month: 7,500 requests a day, 12 requests a second. ULTRA $20.99: 25,000 a day. MEGA $45.99: 65,000 a day [read: [football-api](https://highlightly.net/football-api/)]. |

### API-Football / API-Sports (api-football.com): ruled out

| Point | Finding |
|---|---|
| Free plan | 100 requests a day, and "all endpoints". "Free plans are limited in terms of available seasons" [read, via search: [pricing](https://www.api-football.com/pricing)]. 10 requests a minute, and the quota resets at 00:00 UTC [read, via search: [rate limit](https://www.api-football.com/news/post/how-ratelimit-works)]. |
| Current season | **Not on the free plan.** The official tutorial gives free access as seasons from "Year-4 through Year-2", which is 2022-2024 in 2026, and says 2021 is no longer free [read, via search: [all data from a league](https://www.api-football.com/news/post/how-to-get-all-data-from-a-league-with-api-football)]. Two independent projects quote the live error "Free plans do not have access to this season, try from 2022 to 2024." on current matches [third-party: [ACL_M3 PR #60](https://github.com/youssef20031/ACL_M3/pull/60), [onibsport PR #16](https://github.com/onimisib93-Bello/onibsport/pull/16)]. |
| Consequence | Live data, events, lineups and stats exist, but not for 2026/27 on the free plan. This alone rules it out. The remaining points (live update interval, team-search behaviour) were not checked further, because the official docs answer 403. |
| Cheapest paid | Pro $19/month with 7,500 requests a day. Ultra $29 with 75,000. Mega $39 with 150,000 [read, via search: [pricing](https://www.api-football.com/pricing)]. |

### football-data.org: ruled out as the main source, possible fallback for scores

| Point | Finding |
|---|---|
| Free plan | "Free Plan is Free Forever". 12 competitions, "Scores delayed", "Schedules delayed", league tables, "10 calls/minute" [read: [pricing](https://www.football-data.org/pricing)]. No daily cap is stated for registered clients [read: [policies](https://docs.football-data.org/general/v4/policies.html)]. |
| Coverage | The free 12 are Champions League, Primeira Liga, Premier League, Eredivisie, Bundesliga, Ligue 1, Serie A, La Liga, Championship, Brasileirão, World Cup and European Championship [read: [coverage](https://www.football-data.org/coverage)]. **Europa League and Conference League are not free.** The current season is included. |
| Live | Free scores are "delayed". The delay is not quantified on any official page [read: [pricing](https://www.football-data.org/pricing), [FAQ](https://www.football-data.org/documentation/faq)]. One user reports about 5 minutes [third-party, via search: Homey community forum]. Live scores start at the €12/month "Free w/ Livescores" plan [read: [pricing](https://www.football-data.org/pricing)]. |
| Detail | Lineups, substitutions, goal scorers and cards come only with "Free + Deep Data" (€29/month) and above. Match stats (corners, fouls, shots) are a €15/month add-on that requires a paid plan [read: [pricing](https://www.football-data.org/pricing)]. On the free tier **all three detail sections would be hidden**. |
| Team search | No name filter. Teams are fetched by id, or listed per competition [read: [team](https://docs.football-data.org/general/v4/team.html)]. Search would be done locally over cached competition team lists [inferred]. |
| Batching | `GET /v4/matches?ids=…` takes a list of match ids, and `/v4/teams/{id}/matches?status=…&dateFrom&dateTo&limit` gives a team's next match in one call [read: [match](https://docs.football-data.org/general/v4/match.html), [team](https://docs.football-data.org/general/v4/team.html)]. |
| Terms | Show "Data provided by football-data.org" in a visible place [read: [FAQ](https://www.football-data.org/documentation/faq)]. Free for non-commercial use. One key per application, kept confidential and not in open-source repos [read, via search: football-data.org blog and terms]. |

### TheSportsDB: ruled out

The free key is `123`, with 30 requests a minute. `searchteams` free is "limited to just
"Arsenal"". `eventsnext` / `eventslast` return 1 row and "free key only shows home event".
Lineup, timeline and event stats are capped at 5 rows. Livescores are premium only (v2) [read:
[documentation](https://www.thesportsdb.com/documentation), [pricing](https://www.thesportsdb.com/pricing)].
The cheapest paid plan is $9/month with "2 min livescore" [read: [pricing](https://www.thesportsdb.com/pricing)].

### Sportmonks: ruled out

The free plan covers only "the Danish Superliga & Scottish Premiership (including the play-offs)",
with "No expiration" [read: [free plan](https://www.sportmonks.com/football-api/free-plan/)]. The
cheapest paid plan is Starter at €29/month for "Any 5 leagues", with 2,000 calls per entity per
hour [read: [pricing](https://www.sportmonks.com/football-api/pricing/)]. That is still short of
the 10 target competitions.

### Not considered credible

ESPN's public scoreboard JSON is used by several hobby projects, but it is undocumented and has no
terms that grant API use [third-party: the search results above]. It can change or be blocked
without notice, so it is left out.

## Request budget

Assumptions [inferred]:

- **Poll window:** kick-off to final whistle is about 45 + 15 + 45 + stoppage, so about 2 hours
  (120 minutes). Extra time and penalties add about 40 minutes.
- **Calls per window at interval T (minutes):** 120 / T. That is 120 at 1 minute, 60 at
  2 minutes, 40 at 3 minutes and 24 at 5 minutes.
- **League-list poll:** `GET /matches?leagueId=X&date=D` returns every match of that competition
  that day, each with state, clock and score. The default page size is 100, so it is one call. It
  carries all pinned matches of one competition at the same time. It returns no events or stats.
- **Per-match poll:** `GET /matches/{id}` returns state, events and stats, but costs 1 call per
  match per tick.
- **Other calls per pinned match:** lineups 1-2 calls. Next-fixture lookup 2 calls per team
  (home and away) after the final whistle, or once a day.

### Highlightly free (100 a day)

| Scenario | Calls | Fits 100? |
|---|---|---|
| 1 pinned match, bar by league list at 2 min, plus lineups 2 and next lookup 2 | 60 + 4 = 64 | Yes, with about 36 left for the detail panel |
| Same at 1 min | 120 + 4 = 124 | **No** |
| Champions League night, pinned teams in the 18:45 **and** 21:00 slots, league list at 2 min (2 windows), 3 teams | 120 + 6 + 6 = 132 | **No** |
| Same at 3 min | 80 + 12 = 92 | Yes, barely, with nothing left for the detail panel |
| 3 pinned teams in one slot (one competition), 2 min | 60 + 12 = 72 | Yes |
| 3 pinned teams in one slot but **3 different competitions**, 2 min | 3 × 60 + 12 = 192 | **No**. At 5 min: 72 + 12 = 84, yes |
| Saturday with 3 pinned teams in 3 different kick-off slots, 2 min | 180 + 12 = 192 | **No**. At 4 min: 90 + 12 = 102, just over |
| All 9 Champions League matches, each polled by id at 2 min | 9 × 60 = 540 | **No** (5×) |
| Detail panel left open for a whole match, refreshed every 5 min (stats only change every 5) | +24 per match | Only on a 1-window day |

**Conclusion [inferred]:** on the free tier the backend has to be quota-aware. It should dedupe
across chats, poll per competition and day rather than per match, and fetch details only while
the panel is open. It should also read `x-ratelimit-requests-remaining` and stretch the interval,
or stop with a "data paused" state, before the quota hits zero. A 1-2 minute delay holds on a
quiet day (one kick-off window with pinned teams). Busy days drift to 3-5 minutes. Nine matches
at once is fine for the bar if they are in one competition and one slot, which is 1 call per tick.

### Highlightly Pro (7,500 a day, information only)

All 9 Champions League matches polled by id every minute: 9 × 120 = 1,080 calls, plus lineups
and lookups, roughly 1,100. That is about 15% of the daily quota.

### football-data.org free (10 a minute, no daily cap)

One `GET /v4/matches?ids=…` call per minute carries any number of live matches. The minute budget
of 10 leaves room for next-match lookups. The budget is never the problem here. Delay, coverage
(no Europa or Conference League) and missing details are.

## Open points to check with a real Highlightly key

1. What "Some results might be hidden with FREE tier" hides in practice (matches, events, stat
   rows?).
2. Whether `/teams?name=Inter` is a partial match, and what "Milan", "Atletico" and "Inter" return.
   Also whether national teams share names with clubs ("Italy" club vs national).
3. Which `displayName` rows `/statistics/{id}` returns for a top-5 league match. In particular,
   whether offsides and total shots exist.
4. At what UTC time the daily quota resets.
5. How promptly `state.clock` and `state.score` move during a live match, compared with the
   documented one-minute refresh.
