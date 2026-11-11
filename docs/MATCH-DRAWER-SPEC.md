# Match drawer spec

The Match drawer opens from a Match bar in a direct chat. It shows a Team pin's match with both lineups drawn on a football pitch, the team's next and recent matches, and its standings in every competition it plays. It sits beside the chat and stays open until the person closes it.

This spec replaces the "Drawer" section of the [Team pins spec](TEAM-PINS-SPEC.md), which stays the record of what Team pins shipped with. Terms such as Team pin, Match bar, Match drawer and Derby are defined in [`GLOSSARY.md`](../GLOSSARY.md).

Decisions and evidence come from [the map](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/125) and its closed tickets:

- [What does ESPN return for a team's recent matches and its competitions?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/128), findings on the throwaway branch [`research/espn-recent-matches`](https://github.com/NoahGiesel/tauri-convex-chat-app/blob/research/espn-recent-matches/docs/research/espn-recent-matches.md)
- [What does ESPN return for standings in each kind of competition?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/127), findings on [`research/espn-standings`](https://github.com/NoahGiesel/tauri-convex-chat-app/blob/research/espn-standings/docs/research/espn-standings.md)
- [What does ESPN return for a player's place on the pitch?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/126), findings and the table of places per formation on [`research/espn-pitch-positions`](https://github.com/NoahGiesel/tauri-convex-chat-app/blob/research/espn-pitch-positions/docs/research/espn-pitch-positions.md)
- [What closes the match drawer, and does it cover the chat or sit beside it?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/129)
- [What do the standings and recent matches tabs hold?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/130)
- [What does the richer match drawer look like?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/131), with the prototype on the throwaway branch [`prototype/match-drawer`](https://github.com/NoahGiesel/tauri-convex-chat-app/tree/prototype/match-drawer)
- [How is the drawer's new data stored and refreshed in Convex?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/132)
- [Does a row in the Matches tab open that match, and how are its details fetched?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/136)
- [How does the drawer show the Matches and Standings tabs of a derby between two Team pins?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/137)
- [Which scenarios do the tests of the richer drawer cover?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/133)
- [What does the finished match drawer spec say?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/134)

Code to follow:
- **The drawer and the chip row:** `src/components/team-pins/match-drawer.tsx` and `pin-row.tsx`.
- **ESPN calls and parsing:** `convex/espn.ts`, the only provider module ([ADR 0001](adr/0001-espn-json-for-team-pins.md)).
- **Match storage, polling and cleanup:** `convex/footballMatches.ts` and `convex/crons.ts`.
- **The prototype's layout and fake data:** `src/components/team-pins/match-drawer.prototype.tsx` on `prototype/match-drawer`. It is a picture to follow, not code to copy.

Read `convex/_generated/ai/guidelines.md` before writing Convex code.

## Scope

**In scope:**
- The Match drawer of Team pins, in direct chats, for football.
- Its layout beside the chat and its closing rules.
- Both lineups drawn on a pitch.
- The pinned team's next and recent matches, and opening a finished one.
- The pinned team's standings in its league, its European cup and its national-team competitions, and its path in a cup without a table.

**Out of scope:**
- Other sports and group chats.
- Goal notifications and any other alert.
- Player ratings and heatmaps.
- Paid APIs and a second data provider.
- The standings or matches of a team or league that is not pinned. A team that is not pinned appears only as a row in a table.

## Layout and closing

- **Beside the chat.** The drawer is 380px wide, on the right of the chat column. The chat column narrows while it is open, so messages and the message box stay fully visible.
- **Narrow window.** If the chat column would drop below about 360px, the drawer covers the whole chat area instead. That always happens in the pop-out chat window (`minWidth` 420). The closing rules are the same in both layouts.
- **What closes it:** its X, a second click on its own chip, or Esc while focus is inside the drawer. A click outside does not close it. Esc pressed elsewhere (the message box, a message edit, a picker) leaves it open.
- **Another chip:** a click on another chip switches the drawer to that chip's match. It stays open.
- **Another chat:** each chat remembers its own drawer while the app runs. Opening another chat shows that chat's drawer only if it was opened there. Coming back reopens this chat's drawer on the same team.
- **The chip moves to the next match:** the drawer follows the team and shows the new match. If a Derby chip splits into two, the drawer follows the team pinned first.
- **A Team pin is removed** (by either person): the drawer closes only when none of its pinned teams is left. In a Derby, removing one of the two pins keeps it open on the other team.
- **Windows and restarts:** the main window and a pop-out window each keep their own drawer state. After an app restart the drawer starts closed. Nothing is persisted.

## The drawer

From top to bottom: the **header**, then **underline tabs**, **Match**, **Matches** and **Standings**, with the selected tab underlined in the accent colour. Only the app's theme tokens are used, so the drawer follows the light and dark themes. The pitch is a fixed green with white lines in both themes. Team colours come from the team.

### Header

Competition, venue, both crests and short names, the score and the state, as today. Extra time and penalties are spelled out ("After extra time", "Argentina win 4–2 on penalties"). A stale match shows the "Live score unavailable" line, as today. For an older match opened from a row, the state reads "FT · 1 Nov", with the date in place of the time.

### Match tab

From top to bottom: **Lineups**, **Bench**, **Events**, **Stats**. A section without data is not rendered.

- **Lineups: both teams on one vertical pitch.**
  - The away team is in the top half, attacking down, with its left and right mirrored. The home team is in the bottom half, attacking up.
  - Each team's name and formation sit at its end of the pitch.
  - Rows come from each starter's stored `row`, and the order within a row from `order` (see [Place on the pitch](#place-on-the-pitch)).
- **Player marker:** a circle in the team's colour with the jersey number, and the short name under it on a dark label. Badges sit at the circle's top right: ⚽ per goal, a yellow or red card, and "↓ 61'" for a player who went off. Badges join to the player by athlete id. There are no headshots (ESPN has them for 7% of players) and no captain mark (ESPN gives none).
- **Bench:** two columns under the pitch, home on the left, each player with his jersey number. A player who came on is in bold, with "↑ 61' for Mkhitaryan" under his name. He gets no place on the pitch, because ESPN gives none.
- **A lineup without places** (a summary from before about 2016, or a row stored before this spec): two plain lists, one per team, each with its formation, and the line "Positions aren't available for this match."
- **Events: a centred timeline.** The minute and the icon sit on a vertical centre line, home events on the left and away events on the right. Each event shows the player, plus the assist or the player replaced. Goals, penalty goals, own goals, yellow and red cards and substitutions are shown, as today.
- **Stats:** the current split bars. Each row shows the home value, the label, the away value, then a bar. The rows are possession, shots, shots on target, corners, fouls and offsides.

### Matches tab

- **Next:** the next 3 scheduled matches.
- **Recent:** the last 10 finished matches, newest first, across all competitions, without friendlies (`club.friendly`, `fifa.friendly`).
- **One compact row per match:** the date, a competition tag (`SA`, `UCL`, `CI`), H or A, the opponent, then the score and a W/D/L badge. The score includes the shoot-out score when there was one. An upcoming match shows its kick-off time instead of the score. The W/D/L badges stand in for "form", which ESPN's standings do not give.
- **A finished row opens that match** (see [Opening a finished match](#opening-a-finished-match)). An upcoming row does not open.

### Standings tab

- **Competition chips** across the top, one per competition of the team this season (see [A team's competitions](#a-teams-competitions)). The tab opens on the competition of the chip's match. When that competition has nothing to show, it falls back to the team's league.
- **A table** gets the columns #, team, P, GD and Pts. W-D-L and goals for and against are left out to fit 380px.
  - Every row is shown, scrolled so the pinned team's row is in view. That row is highlighted in the accent's soft colour.
  - The chat's other pinned teams get a pin icon on their row.
  - A coloured edge on the rank marks each zone (Champions League, relegation and so on), from ESPN's zone note. A legend of the zones sits under the table. A table without notes has no edges.
- **A competition made of groups** (World Cup qualifying, the Nations League, a World Cup, a European cup's old group stage) shows only the team's own group.
- **A cup without a table** (Coppa Italia, FA Cup) shows the team's **path**. It is a vertical line of rounds, each with the opponent and either the score and a W/D/L badge, or the date. A played round opens that match.
- **A cup past its league phase** shows "Knockout rounds", the team's path, above "League phase · final", the frozen table. ESPN keeps that table as it ended and never lists knockout rounds, so those matches come from the team's schedule.
- **Season check:** a table shows only when its season is the team's current season. ESPN's plain request can return a table years old (`uefa.euro` returns Euro 2024).

### Loading, no data and stale data

- **Loading:** grey pulsing lines in the tab's body.
- **No data:** one centred line per tab:
  - Match: "Lineups are usually out about an hour before kick-off."
  - Matches: "No matches found."
  - Standings: "No table for this competition yet."
- **Stale:** when a tab's data is more than 24 hours old, the tab shows "Last updated <time>" with the warning icon used for an unavailable match.

### Opening a finished match

- A finished match opens in the **Match tab** of the same drawer. That covers a row of the Matches tab and a played round of a cup's path.
- While an older match is shown, the top of the Match tab has a "← Back to <the chip's match>" link. Clicking the chip again also returns to the chip's match. The opened match is drawer state only. It is gone when the drawer closes.
- The details are fetched on demand (see [Older matches](#older-matches)). The tab shows its loading state while they are missing. If nothing has arrived after 20 seconds, it shows "Couldn't load this match" with a **Try again** button.
- Opening an older match never changes the chip's match, the live poll, `lastMatchId` or `nextMatchId`.

### Derby

A Derby is one chip for two Team pins of the chat.

- **The Match tab is unchanged:** one match, both teams on the pitch.
- **The Matches and Standings tabs show one team at a time**, with a two-crest team switch at the top (`[INT] Inter | [MIL] AC Milan`). The switch opens on the team pinned first.
- **The competition chips follow the selected team.** On a team switch, the selected competition stays if the other team plays it too, which the Derby's own competition always is. Otherwise the chips fall back to the Derby's competition.
- **A table holding both teams** highlights the selected team's row. The other pinned team gets the pin icon.
- **After the Derby**, when the chip splits, the drawer follows the team pinned first and the team switch disappears.

## Data source

ESPN stays the only provider, through `convex/espn.ts` ([ADR 0001](adr/0001-espn-json-for-team-pins.md)). Requests are keyless, as today. The new ones:

| What | Request | Notes |
|---|---|---|
| A team's finished matches | `/apis/site/v2/sports/soccer/all/teams/{id}/schedule` | Every competition in one call, newest first. A club gets its current season; a national team gets its last 25 matches. |
| A team's scheduled matches | the same, with `?fixture=true` | Soonest first. Kick-offs not fixed yet have `timeValid: false`. |
| A competition's table | `/apis/v2/sports/soccer/{league}/standings` | Not under `/site/v2` (404 there). A competition with no table is a 200 with no `children`. |
| An older match's details | `/apis/site/v2/sports/soccer/all/summary?event={id}` | The league in the path does not matter. Summaries stay complete for years. |

Facts the parsers rely on:

- **Schedule entries** carry `id` (the same event id as the scoreboard and the summary), `date`, `league.slug` / `name` / `abbreviation`, `seasonType.name` (the round), both competitors (`homeAway`, `id`, names, abbreviation, logos), `score.value`, `winner` and `status.type`. The shoot-out score is at `competitors[].score.shootoutScore`, not where the scoreboard has it.
- **Standings** come as `children[]`, one table per group (one for a league), with `standings.entries[]`. A row has `team` and 14 `stats` read by `name`: `rank`, `gamesPlayed`, `wins`, `ties`, `losses`, `pointsFor`, `pointsAgainst`, `pointDifferential`, `points`. An optional `note` (`color`, `description`) labels the zone. Colours can start with `##`, and descriptions can carry stray tabs. Group rows are not in rank order. `season.year`, `startDate` and `endDate` mark the season. There is no form.
- **Lineups** come from the summary's `rosters[]`: `formation` per side, and per starter `formationPlace` (`"1"` to `"11"`) and `position.abbreviation`. Per player there are `athlete.id`, `athlete.shortName`, `subbedIn` / `subbedOut` / `subbedInFor` / `subbedOutFor`, `stats` and `plays`. A player who came on has place `"0"` and label `SUB`. Before the lineups are out, a `rosters[]` entry has no `roster` key at all.
- **A table changes only after full time,** 4 to 8 minutes after the whistle in the one match watched.

## Data model

### Place on the pitch

`footballMatchDetails` changes:

- Each lineup player gains optional `row` and `order` (starters only), `athleteId` and `shortName`.
- Each event gains optional `playerId` and `otherId`.

`parseSummary` derives `row` and `order` from `formation` + `formationPlace` through a **fixed table per formation**: the 12 formations in the research findings, each place mapped to a row (from the back) and an order (from the team's own left). For a formation not in the table, it falls back to the **label rule**:

1. Place `"1"` (`G`) is the goalkeeper.
2. Sort the other 10 by the depth of their label. First the back line (`CD*`, `LB`, `RB`), then `DM`/`SW`, then `CM*`/`LM`/`RM`/`M`, then `AM*`, then `CF-L`/`CF-R`/`RCF`, then `F`/`LF`/`RF`.
3. Cut that list into rows of the sizes in the formation string, from the back.
4. Order each row left to right: `LB`/`LM`/`LF`, then `*-L`, then the centre, then `*-R`/`RCF`, then `RB`/`RM`/`RF`.

The table comes first because labels are often `SUB` or only `G`/`D`/`M`/`F` before kick-off, while places are already set. Without `formationPlace` (the 2015 summary), no `row` is stored and the drawer shows the plain lists.

**A missing `roster`** is read as an empty lineup instead of throwing `ESPN: rosters[].roster missing`. Events and stats are then stored from the first poll, and also for matches that never get lineups.

The stored lineup follows the latest summary, as today, so a formation change during a match shows up. **No migration:** a row saved before this change has no `row`, and the drawer shows the plain lists for it. The cleanup deletes such rows anyway.

### `footballTeamSchedules`

One row per pinned team (`teamId`, indexed):

- `results`: the current season's finished matches.
- `fixtures`: every scheduled match.
- `competitions`: the team's competitions this season (below).
- `fetchedAt`.

A result or fixture is a light row:
- event id, kick-off, league slug and short name, round;
- opponent (team id, name, short name, logo), home or away;
- score, shoot-out score, state.

About 60 results and 35 fixtures at about 200 bytes each, well under the document limit. It is separate from `footballMatches`, so the live poll and the 7-day cleanup of matches are unchanged.

### A team's competitions

The `competitions` field holds the distinct league slugs of the results plus the fixtures, without `club.friendly` and `fifa.friendly`. Both lists are needed: Inter's Coppa Italia and Supercoppa appear only among the fixtures. A national team's 25 matches span several cycles, so its entries are also filtered by each entry's `season`. Each competition keeps its slug, name, short name and season. It is recomputed on every refresh.

### `footballStandings`

One row per league slug and season (indexed by league), shared by every chat:

- `season`, `endDate`.
- `groups`: each with a name and its rows, sorted by rank when stored. A competition without a table is stored with no groups, so the drawer knows to show the path.
- A table row: rank, team id, name, short name, logo, played, goal difference, points, and an optional zone `{ color, label }`, cleaned when parsed.
- `fetchedAt`.

### Older matches

`footballMatches` gains an optional `detailsRequestedAt`.

A new mutation, `footballMatches.openPast({ conversationId, eventId })`:

1. Checks that the caller is a member of the chat, and that the event is in the `footballTeamSchedules` row of a team the chat pins.
2. Is limited to 10 opens per person per minute by the `@convex-dev/rate-limiter` component, which is new to the project.
3. Does nothing if the match already has details, or if `detailsRequestedAt` is less than 60 seconds old. Repeated clicks, and several chats opening the same match, share one fetch.
4. Otherwise inserts a `footballMatches` row from the schedule entry (state `post`) unless one exists, sets `detailsRequestedAt`, and schedules an action that fetches the summary and writes `footballMatchDetails`.

The drawer reads it with the existing `footballMatches.details` query. `tick` ignores `post` matches, so the row is never polled. Its kick-off is more than 7 days ago, so the next daily cleanup deletes the pair. A match from the last 7 days is usually stored already.

## Scheduling

- **Schedules:** fetched when a team is pinned, at FT + 10 minutes after one of its matches, and in the existing 6-hour cron (`refreshPinnedTeams`). Each fetch is 2 requests, results and fixtures. The cron fetches each pinned team once, however many chats pin it.
- **Standings:** every league in the competitions of any pinned team, in the 6-hour cron and at FT + 10 minutes after a pinned team's match. The cron is needed because other teams' results move the table too. There is no fetch during a live match, and none when the drawer opens.
- **Failures:** a failed fetch leaves the rows and their `fetchedAt` untouched and logs the error, as the existing fetches do.
- **Cleanup:** the daily cleanup also deletes the schedule row of a team that no chat pins.
- **Traffic:** with 10 pinned teams in 5 leagues, roughly 100 to 150 requests a day, gzipped. Each finished match of a pinned team adds 3 requests.

## Queries

- `footballTeamSchedules.forPin({ conversationId, teamId })`: the team's next and recent matches and its competitions.
- `footballStandings.forPin({ conversationId, teamId, league })`: the table for that competition, with only the team's group for a competition made of groups, or no table when its season is not the team's current one.

Each returns `null` unless the caller is a member of the chat and the chat pins that team. That is the same check as `footballMatches.details`.

## Strings and release notes

Each implementation ticket adds its own strings in all five languages in `src/i18n`. The `Messages` type fails the build if a language misses a key. English and Italian wording for the main strings:

| English | Italian |
|---|---|
| Match / Matches / Standings (tabs) | Partita / Partite / Classifica |
| Bench | Panchina |
| Next / Recent | Prossime / Recenti |
| W / D / L (badges) | V / N / P |
| P / GD / Pts (columns) | G / DR / Pt |
| ↑ {min} for {name} | ↑ {min} per {name} |
| ← Back to {match} | ← Torna a {match} |
| Couldn't load this match | Impossibile caricare questa partita |
| Try again | Riprova |
| Last updated {time} | Ultimo aggiornamento {time} |
| Lineups are usually out about an hour before kick-off. | Le formazioni escono di solito circa un'ora prima del calcio d'inizio. |
| No matches found. | Nessuna partita trovata. |
| No table for this competition yet. | Nessuna classifica per questa competizione. |
| Positions aren't available for this match. | Posizioni non disponibili per questa partita. |
| {team}'s path | Il percorso di {team} |
| Knockout rounds | Fase a eliminazione diretta |
| League phase · final | Fase campionato · finale |

**No gate.** Team pins are released, and each ticket leaves the drawer whole, so a release can be cut between any two of them. Each ticket adds its own user-visible item, in English and Italian, to the `"next"` entry of `src/data/release-notes.ts`. The backend parts are additive. The new fetches run only for teams that are already pinned.

## Testing

The three layers of the Team pins spec.

**New recorded fixtures** in `convex/espnFixtures/`, trimmed of the fields we don't read:
- a 2026 summary with `formationPlace`, substitution fields and per-player `stats` / `plays`;
- a summary from before the lineups are out (no `roster` key);
- the 2015 Inter v Atalanta summary (no `formationPlace`);
- Inter's schedule, results and fixtures;
- Italy's schedule, for the season filter;
- standings for `ita.1`, `uefa.champions` (league phase), `uefa.nations` (groups not in rank order), `ita.coppa_italia` (no `children`) and `uefa.euro` (an old season).

**`convex-test` scenarios:**
1. **Summary parser:**
   - places become `row` and `order` on both sides, and the label rule places a formation that is not in the table;
   - the 2015 summary gets no `row`;
   - a missing `roster` gives empty lineups but keeps events and stats;
   - events carry player ids.
2. **Schedule parser:**
   - the light rows, and the shoot-out score from `score.shootoutScore`;
   - competitions without friendlies;
   - a national team filtered by season.
3. **Standings parser:** zones cleaned, groups sorted by rank, no `children` gives no groups, and `season` / `endDate` are read.
4. **Refreshes:**
   - pinning a team fetches its schedule and its competitions' tables;
   - FT schedules both at +10 minutes;
   - the 6-hour cron fetches each team and league once across chats;
   - a failed fetch leaves rows and `fetchedAt` untouched;
   - the cleanup deletes the schedule of a team no chat pins.
5. **The two `forPin` queries:** `null` for a non-member, and for a chat that does not pin the team. Only the team's group, and no table from another season.
6. **`openPast`:**
   - refused for a non-member, a team not pinned, and an event not in the schedule;
   - inserts a `post` row and schedules one fetch;
   - a second call within 60 seconds fetches nothing, and an 11th open in a minute is refused;
   - no fetch when details exist;
   - never polled by `tick`, and deleted by the next cleanup.
7. **Old rows:** a details row saved before the change still loads.

**Vitest unit tests on pure client functions:**
- **Pitch layout:** a lineup becomes pitch positions, with the away side mirrored. Event badges join players by id.
- **Matches tab:** the last 10 results without friendlies, and the next 3 fixtures.
- **Standings view:** the selected row highlighted, other pinned teams marked, the cup path, and knockout rounds above the final table.
- **Stale data:** "Last updated" only past 24 hours.
- **Derby:** the switch opens on the team pinned first, and the competition fallback works.
- **Drawer state:**
  - it follows its team to the next match;
  - it closes when none of its pinned teams is left;
  - each chat keeps its own drawer;
  - it covers the chat below a 360px chat column.

**E2E (phase three in `docs/E2E-SPEC.md`):**
- **The stub** gains schedules for Inter, AC Milan and Juventus, standings for `ita.1` and `uefa.champions`, an empty Coppa Italia, and a summary with places for the live match. It returns an error for the unavailable league's standings.
- **The `football` Seed** writes the schedule and standings rows itself.

Scenarios:
1. **The drawer stays open:**
   - clicking in the chat and sending a message keeps it open, and the message box stays fully visible;
   - Esc in the message box keeps it open;
   - Esc inside the drawer, its X, and a second chip click each close it.
2. **Another chat:** opening another chat and coming back shows the drawer again on the same team.
3. **The pitch:** 22 markers, a goal badge on the scorer, and a player who came on in the bench.
4. **The Matches tab:** rows with W/D/L badges. Opening a finished row shows that match with "← Back".
5. **The Standings tab:**
   - Serie A, with Inter highlighted and the other pinned team marked;
   - the chips switch to the Champions League;
   - Coppa Italia shows the path.
6. **A Derby:** the team switch on Matches and Standings.
7. **A removed pin:** bob removes the pin, and alice's open drawer closes.

The narrow-window layout is covered by the Vitest drawer-state test, not by E2E.

**Manual smoke** gains one step: in a release build, open the drawer of a real pinned team, and check its pitch, Matches and Standings against ESPN.

## Implementation order

The work is split into vertical tickets, one PR each. GitHub holds the blocking edges. Each ticket waits for the one before it, and each carries its own tests, strings and release-notes item.

1. **[The match drawer stays open beside the chat](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/138).** Layout beside the chat and the narrow-window cover, the closing rules, per-chat and per-window state, following the team to the next match, closing when no pinned team is left. Frontend only.
2. **[The Match tab draws the lineups on a pitch](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/139).** The summary parser's places, ids, short names and missing-roster fix, with the new summary fixtures. Then the header, the tab bar with the Match tab, the pitch, the bench, the centred timeline and the plain-list fallback.
3. **[The Matches tab lists a pinned team's next and recent matches](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/140).** The schedule parser and fixtures, `footballTeamSchedules`, its refreshes and cleanup, `footballTeamSchedules.forPin`, and the Matches tab.
4. **[A finished match opens from the drawer](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/141).** `openPast`, `detailsRequestedAt`, the rate-limiter component, the Back link and Try again.
5. **[The Standings tab shows a pinned team's tables](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/142).** The standings parser and fixtures, `footballStandings`, its refreshes, `footballStandings.forPin`, the season check, the competition chips, the table, the cup path and the knockout layout.
6. **[A Derby drawer switches between its two teams](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/143).** The team switch on Matches and Standings, the competition fallback, and the highlight.
7. **[The E2E suite covers the richer drawer](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/144).** The stub, the Seed, the seven scenarios, phase three in `docs/E2E-SPEC.md`, and the Manual smoke step.

## What is not verified

- **Pre-match and live lineups of men's matches.** Places set before kick-off, labels arriving at kick-off, a formation changing during a match, and lineups 42 to 63 minutes before kick-off were all seen on women's matches only.
- **Whether a finished summary keeps the starting shape or the last one,** and formations never seen (5-3-2, 5-4-1, the diamond, 4-2-2-2, 4-5-1). The label rule is the fallback for them.
- **Summaries between 2015 and 2025:** when `formationPlace` starts.
- **The standings during a running season's knockout rounds.** It is a guess from finished seasons that the plain request keeps the league-phase table. Check it in February 2027 on `uefa.champions`.
- **A season that exists but has not kicked off,** and the day the plain request switches to the new season.
- **Points deductions and tie-breaks:** whether `points` includes a deduction, and whether ESPN's `rank` follows each competition's tie-break rules.
- **The table update after full time** was timed on one match only (4 to 8 minutes). It was not seen after penalties or for an abandoned match.
- **The 25-match cap of a national team's schedule,** and the first weeks of a club's new season.
- **The new endpoints from Convex's egress IPs,** and ESPN's rate limits. All research requests came from a home connection.
