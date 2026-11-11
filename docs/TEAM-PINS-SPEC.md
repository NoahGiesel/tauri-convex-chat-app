# Team pins spec

A Team pin fixes a football team at the top of a direct chat. Its Match bar shows the team's next match, the live score while it is played, and the final score afterwards. A click opens a drawer with the match's events, lineups and stats.

Terms such as Team pin, Match bar, Pinned message and System line are defined in [`GLOSSARY.md`](../GLOSSARY.md).

Decisions and evidence come from [the map](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/99) and its closed tickets:

- [Which free football API can feed Team pins?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/100) and [What does the Highlightly free plan return with a real key?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/105): the Highlightly free plan, now the documented fallback only
- [Is there a free data source better than Highlightly's free plan?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/106), with findings on the throwaway branch [`research/free-football-alternatives`](https://github.com/NoahGiesel/tauri-convex-chat-app/blob/research/free-football-alternatives/docs/research/free-football-alternatives.md)
- [Does ESPN's JSON answer from a Convex action?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/107)
- [Do we switch Team pins to ESPN, with Highlightly as fallback?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/108), recorded in [ADR 0001](adr/0001-espn-json-for-team-pins.md)
- [What do the Match bar and match detail panel look like?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/101), with the prototype on the throwaway branch [`prototype/match-bar`](https://github.com/NoahGiesel/tauri-convex-chat-app/tree/prototype/match-bar)
- [How are Team pins and match data stored and refreshed in Convex?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/102)
- [What does the Match bar show in its edge states?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/111)
- [Which Team pin scenarios do the tests cover?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/103)
- [What does the finished Team pin spec say?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/104)

Code to follow:
- **Chat commands:** `COMMANDS` and `DIRECT_ONLY` in `src/components/conversation-view.tsx`.
- **Fetching from an action, and its tests:** the link previews (`convex/previews.ts`, `convex/previews.test.ts`).
- **Scheduled jobs and fake timers:** the Wordle Duel (`convex/wordleDuels.ts`, `convex/wordleDuels.test.ts`).
- **Pinned messages** (`convex/pins.ts`) are a different feature. Their `pins` table is not touched.

Read `convex/_generated/ai/guidelines.md` before writing Convex code.

## Scope

**In scope:**
- Football, in direct chats only.
- Up to 3 Team pins per chat. A pin belongs to the chat: either person can add or remove it, and both see it.
- Clubs of Serie A, Premier League, LaLiga, Bundesliga, Ligue 1, the Champions League, Europa League and Conference League, plus every national team.
- A pinned team's matches in **any** competition ESPN carries (Coppa Italia, FA Cup, qualifiers, friendlies).

**Out of scope:**
- Other sports and group chats.
- Goal notifications and any other alert beyond the Match bar.
- Player ratings and heatmaps. Standings were out of scope here too; the [Match drawer spec](MATCH-DRAWER-SPEC.md) brings them in.
- Paid APIs, and a second data provider in the first version (see [Data source](#data-source)).

## Rules

- **`/calcio <team name>`** opens a picker of matching teams above the message box. Choosing one adds the Team pin. The command is in `DIRECT_ONLY`, so it is not offered in a group chat.
- **At most 3 Team pins** per chat. A 4th is refused inside the picker.
- **No duplicate team** in a chat. Pinning one again is refused inside the picker.
- **Either person removes a pin** with the X on its chip.
- **A System line** reports each add and remove, e.g. "📌 Stefan pinned Inter". It is silent: it does not count as unread, sends no notification and does not move the chat in the list.
- **Derby:** when two pinned teams play each other, one chip shows that match, and both pins still count towards the 3. Before and after the match, each team's chip shows its own match.
- **Live delay:** up to about 1-2 minutes. The backend polls only while a pinned team's match is live or within 60 minutes of kick-off.

The server enforces every rule. The picker shows the refusals, but it is not what stops them.

## Data source

**ESPN's public JSON is the only data source** ([ADR 0001](adr/0001-espn-json-for-team-pins.md)). It is undocumented and its terms forbid automated access. That risk was accepted on purpose, because this app is private and noncommercial.

All ESPN calls and parsing sit in **one provider module**, which returns our own types and never exposes ESPN's raw shapes. A second provider can replace it later (the Highlightly free plan is the documented option). Until then, an ESPN failure shows the [unavailable state](#chip-states).

Its base URL is `https://site.api.espn.com/apis`. An optional `ESPN_BASE_URL` Convex environment variable replaces it for the E2E stub. It sends no key and no special headers.

| Use | Endpoint |
|---|---|
| A league's matches of the day | `/site/v2/sports/soccer/{league}/scoreboard` |
| Events, lineups and stats of one match | `/site/v2/sports/soccer/{league}/summary?event={id}` |
| A team and its next match (`nextEvent`, across all competitions) | `/site/v2/sports/soccer/all/teams/{id}` |
| A competition's teams | `/site/v2/sports/soccer/{league}/teams` |

Facts the provider module relies on, all checked on real responses:

- **Team ids are global:** Inter is 110 in `ita.1`, in `uefa.champions` and in `/all/teams`.
- **Polling logic branches on `status.type.state`** (`pre`, `in` or `post`), never on the status name. The same live match came back once as `STATUS_IN_PROGRESS` instead of `STATUS_FIRST_HALF`.
- **Labels branch on the status name:** `STATUS_HALFTIME`, `STATUS_FINAL_AET`, `STATUS_FINAL_PEN`, `STATUS_POSTPONED`, and so on.
- **A shoot-out** has `shootoutScore` on each competitor (2022 World Cup final: ARG 3 (4), FRA 3 (2)).
- **`nextEvent` skips the match being played.** The recorded response for team 110, taken during Como–Inter, already pointed to Atalanta–Inter two weeks later. So a next-match lookup must never replace a match that is live, and a pin added during a match finds it in the competition's scoreboard of the day.
- **Every fetch checks the fields we read.** A missing field counts as a failure, like a non-200 response.

## Data model

Four new tables. Each match is stored once, however many chats pin either team.

| Table | Holds | Indexes |
|---|---|---|
| `teamPins` | `conversationId`, `teamId` (ESPN id), `pinnedBy`, `pinnedAt` | by conversation; by conversation and team; by team |
| `footballTeams` | the `/calcio` index: `teamId`, display name, short name, abbreviation, logo, competition (or national team), search keys; plus `lastMatchId` and `nextMatchId` for pinned teams | by `teamId`; whatever the search needs |
| `footballMatches` | one row per ESPN match: `eventId`, league slug, home and away team ids, kick-off, `state`, status name, score, shoot-out score, clock, `fetchedAt` | by `eventId`; by league and state |
| `footballMatchDetails` | one row per match: the trimmed events, lineups and stats (a few KB, not ESPN's ~400 KB summary), `fetchedAt` | by match |

`messages.kind` gains `"system"`. A system message carries the System line's text parts: who, the action (`pinned` or `unpinned`) and the team name. Each client renders it in its own language.

## Scheduling

| Job | When | What |
|---|---|---|
| Live tick | cron, every 30 s | A mutation reads the last and next match of every pinned team, deduped across chats. It picks the matches that are `in`, or `pre` with kick-off less than 60 min away (a delayed kick-off still counts), and schedules **one fetch action per league involved**. That action reads the scoreboard, updates the picked matches, and fetches each one's summary. With nothing to poll, the tick costs one index read and schedules nothing. |
| At FT | when a match turns `post` | One final summary fetch, then the details stay cached. The team's `lastMatchId` becomes that match, and the next-match lookup runs. A postponed or cancelled match triggers the same lookup. |
| Next-match lookup | when a pin is added, at FT, and by a cron every 6 h for every pinned team | Calls `/all/teams/{id}` and upserts the match and the team's `nextMatchId`. The 6 h cron catches moved kick-offs. A match that is live (or about to start) is never replaced by the lookup, because `nextEvent` already skips it. When a pin is added, the lookup also reads the team competition's scoreboard of the day, so a pin added mid-match shows that match. |
| Team index rebuild | cron, weekly; also run once by hand at setup | Rebuilds `footballTeams` from the team lists of `ita.1`, `eng.1`, `esp.1`, `ger.1`, `fra.1`, `uefa.champions`, `uefa.europa` and `uefa.europa.conf`, plus all national teams from `fifa.friendly` (198). Rows are deduped by `teamId`, and the last and next match ids are kept. |
| Cleanup | cron, daily | Deletes finished matches, and their details, older than 7 days that are no team's `lastMatchId`. |

A failed fetch changes nothing and leaves `fetchedAt` as it was. The next tick tries again. Errors go to the Convex logs only.

## Team search

`/calcio` matches locally against `footballTeams`. Matching ignores accents and case, accepts partial names, and knows a small **alias list kept in code**. The aliases cover Italian names (Italia, Spagna, Germania, Francia, Inghilterra, Olanda, Bayern Monaco, Siviglia...) and common nicknames (Juve, Barça, PSG, Man Utd...). Women's and youth teams are never in the index.

Why our own index: ESPN's search misses Italian names. "italia" returns Inter and Juventus, and "spagna", "bayern monaco" and "siviglia" return nothing. It also mixes in clubs from outside the target competitions, such as Inter Miami.

## Interface

The look comes from the prototype (variant B's chip row, with variant A's drawer).

### Chip row

- **All Team pins sit in one row of chips** under the chat header, one chip per Match bar.
- The row is **44px high**, whatever the number of pins, and scrolls sideways if it overflows.
- A chip shows both teams' crests and short names (e.g. `INT`, `COM`), the state, and the X.
- **Derby:** the X opens a small menu ("Unpin Inter" / "Unpin AC Milan"), because the chip holds two pins.

### Chip states

A pure client function decides each chip's state from the team's last and next match, the clock and `fetchedAt`. Queries never read the clock.

| State | The chip shows |
|---|---|
| Next match | date and time of kick-off |
| Live | a pulsing red dot, the score and the minute (`67'`); in extra time, the minute past 90 (`105'`) |
| Half-time | the red dot, the score and `HT` |
| Shoot-out | the red dot and `1–1 · Pens 3–2` |
| Finished | the score and `FT`, `AET`, or `3–3 · 4–2 pens` with the winner's name in bold. It stays until **6 a.m. local time the next day**, or until the next match is less than 60 min from kick-off, whichever is first. |
| Delayed | the time and "Delayed"; still polled |
| Suspended | the last score, a grey dot and "Suspended"; still polled |
| Abandoned | the last score and "Abandoned"; stays like FT |
| Postponed / Cancelled | the date struck through and "Postponed" / "Cancelled", until the original kick-off + 3 h, then the next match |
| Unavailable | a live match not refreshed for over 2 min, or a next match not refreshed for over 12 h. The last known data is greyed out, with a warning icon, and the dot stops pulsing. Hover and the drawer say "Live score unavailable, last update 21:14". It recovers by itself. |
| No match scheduled | a one-team chip: crest, short name, "No match scheduled" and the X. It has no drawer. |

### Drawer

Clicking a chip opens the Match drawer. Its layout, closing rules and tabs are specified in the [Match drawer spec](MATCH-DRAWER-SPEC.md), which replaces this section.

### Picker

- **Sending `/calcio <text>` opens a list above the message box**, in the same place as the command suggestions. The text can still be edited there.
- Each row shows a crest, the name and the competition (or "National team"). Teams already pinned in the chat are marked.
- Refusals show inside the picker.

### System line

A centred pill, "📌 Stefan pinned Inter" / "📌 Stefan unpinned Inter", in the same style as the Wordle Duel result line.

## Strings and release notes

Each implementation ticket adds its own strings in all five languages in `src/i18n`. The `Messages` type fails the build if a language misses a key. English and Italian wording for the main strings:

| English | Italiano |
|---|---|
| `/calcio`: Pin a football team | `/calcio`: Pinna una squadra di calcio |
| 📌 {name} pinned {team} | 📌 {name} ha pinnato {team} |
| 📌 {name} unpinned {team} | 📌 {name} ha tolto il pin a {team} |
| {team} is already pinned | {team} è già pinnata in questa chat |
| This chat already has 3 Team pins. Remove one first. | Questa chat ha già 3 squadre pinnate. Rimuovine una prima. |
| National team | Nazionale |
| Unpin {team} | Togli il pin a {team} |
| No match scheduled | Nessuna partita in programma |
| HT / FT / AET / pens | Intervallo / Finale / d.t.s. / d.c.r. |
| Pens | Rigori |
| Delayed / Suspended / Abandoned | In ritardo / Sospesa / Interrotta |
| Postponed / Cancelled | Rinviata / Annullata |
| Live score unavailable, last update {time} | Risultato live non disponibile, ultimo aggiornamento {time} |
| After extra time | Dopo i tempi supplementari |
| {team} win {score} on penalties | {team} vince {score} ai rigori |
| Events / Lineups / Bench / Stats | Eventi / Formazioni / Panchina / Statistiche |
| Possession / Shots / Shots on target / Corners / Fouls / Offsides | Possesso palla / Tiri / Tiri in porta / Calci d'angolo / Falli / Fuorigioco |

The release notes get one Team pins item in English and Italian, in the `"next"` entry of `src/data/release-notes.ts`. The Launch ticket adds it, together with removing the gate. No earlier ticket adds release notes. Draft:

- **EN:** "Team pins: type /calcio and a team name in a direct chat to pin up to three football teams at the top of the chat. Each shows its next match, the live score and the final score, and a click opens goals, cards, lineups and stats"
- **IT:** "Squadre pinnate: scrivi /calcio e il nome di una squadra in una chat diretta per fissare fino a tre squadre in cima alla chat. Ognuna mostra la prossima partita, il risultato in diretta e quello finale, e con un clic vedi gol, cartellini, formazioni e statistiche"

## Release gate

_The Launch ticket (#117) removed the gate: `/calcio` now shows in every build, in direct chats only. What follows is how it worked until then._

Implementation tickets merge into `master` one by one, and a release can be cut between them. So `/calcio` shows only when `import.meta.env.DEV` is true or `VITE_E2E` is `"1"`, until the Launch ticket removes the gate.

- **The Test build sets `VITE_E2E`,** so the E2E scenarios run before Launch. The release guard already refuses `VITE_E2E` in a release.
- **The backend parts reach production with each `npx convex deploy`:** tables, functions, the `system` message kind and the crons. They are additive. The live tick and the 6 h lookup idle without pins. Only the weekly team-index rebuild calls ESPN before Launch.

## Testing

**`convex-test`, beside the code in `convex/`.** ESPN is faked with **recorded real responses**, saved once as JSON fixtures and trimmed of the fields we don't read. Tests serve them through `vi.stubGlobal("fetch")`, as `convex/previews.test.ts` does, with a helper to tweak the score or state. They use fake timers for the crons and scheduled jobs. The fixtures cover scoreboards in pre / in / HT / post, FT-AET, FT-Pens and postponed, plus a summary, a team with `nextEvent`, and a team list. Scenarios:

1. Adding a pin in a direct chat creates the pin and a silent System line (`lastMessageAt` unchanged), and looks up the next match.
2. Refused: in a group chat, a 4th pin, a duplicate team, and a non-member adding, removing or reading.
3. Either person can remove a pin, which adds an "unpinned" System line.
4. An idle tick fetches nothing.
5. A match within 60 min of kick-off: one scoreboard fetch per league, even with two chats or a derby, plus its summary.
6. Live updates: score and clock change. The state comes from `status.type.state`, so the status name doesn't matter.
7. FT: a final summary fetch and the next-match lookup. The next tick polls nothing.
8. Delayed and suspended matches stay polled. A postponed match triggers the next-match lookup.
9. A non-200 response or a missing field: rows untouched, `fetchedAt` not advanced, error logged.
10. The 6-hourly refresh picks up a moved kick-off.
11. Team-index rebuild and search: accents, partial names, aliases ("italia", "bayern monaco"), no women's or youth teams, all nations present.
12. The daily cleanup keeps each team's last match.
13. The parser on the fixtures: HT, AET, and pens with `shootoutScore`.
14. A pin added during a live match shows it even though `nextEvent` points to the following fixture, and a lookup during a match never replaces it (or clears it).

**Vitest unit tests on the chip-state function:**
- Which match the chip shows: FT until 6 a.m., an earlier switch when the next match is within 60 min, and a postponed match until kick-off + 3 h.
- Every label.
- Unavailable after 2 min (live) or 12 h (next match).
- No next match.

**E2E: phase three in `docs/E2E-SPEC.md`.**

- **The stub:** `ESPN_BASE_URL` points the Test backend at the existing stub on port 3312. The stub serves static canned ESPN data (a team list, team endpoints, scoreboards) exported from `stub.mjs`, like GIPHY's, so the Seed and the stub cannot disagree. This also keeps the Test backend's real crons off live ESPN. The stub returns an error for the league of the "unavailable" match, so the crons cannot refresh it. A release stops if `ESPN_BASE_URL` is set.
- **The Seed and Fixture:** one Fixture, `twoFriendsWithTeamPins`, on a new `football` Seed, which holds the team index and these chats:

| Chat | Team pins |
|---|---|
| alice–bob | none (both have a UI, for the add and remove scenarios) |
| alice–carol | live Inter, plus a derby AC Milan–Juventus in the "next" state |
| alice–dave | FT, postponed, unavailable |
| alice–erin | no match scheduled |

carol, dave and erin are seeded friends of alice with no UI.

Scenarios:
1. `/calcio inter` shows Internazionale in the picker. Choosing it adds the chip and the System line, for both alice and bob.
2. `/calcio italia` finds Italy (an alias, and a national team).
3. Refusals inside the picker: an already-pinned team, and a 4th pin.
4. bob removes a pin with the X. It disappears for alice too, and the "unpinned" System line shows.
5. Each seeded chip state renders: next match, live, FT, postponed, unavailable, and no match scheduled.
6. Clicking the live chip opens the drawer with events, lineups and stats. A pre-match chip's drawer shows only the header.
7. Derby: one chip, and its X menu offers both teams.
8. In a group chat, `/calcio` is not offered.

**Manual smoke** gains one step: pin a team in a release build, and check that its chip shows the real next match from ESPN.

## Implementation order

The work is split into vertical tickets, one PR each. GitHub holds the blocking edges. Each ticket waits for the one before it, and each carries its own `convex-test` cases and strings.

1. **[The football team index is built](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/112).** The ESPN provider module, the recorded fixtures, `footballTeams`, the weekly rebuild cron, and the search query with its aliases. Backend only.
2. **[Two friends can pin a team with /calcio](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/113).** Behind the gate. Includes:
   - `teamPins`, and add and remove with every rule;
   - the silent `system` message kind and its pill;
   - the picker;
   - the chip row with the next match (looked up on pin and every 6 h), "No match scheduled", and the derby chip with its X menu.
3. **[The Match bar follows a live match](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/114).** Includes:
   - the 30 s tick and the per-league fetch;
   - the live, HT, finished, AET, pens and interrupted states;
   - the FT handling and the after-FT lookup;
   - the unavailable state and the daily cleanup.
4. **[The match drawer shows events, lineups and stats](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/115).** The summary fetch, `footballMatchDetails`, and the drawer.
5. **[The E2E suite covers Team pins](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/116).** `ESPN_BASE_URL`, the stub, the release guard, the `football` Seed, the Fixture, the 8 scenarios, and phase three in `docs/E2E-SPEC.md`.
6. **[Team pins are released](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/117).** Remove the gate, add the release-notes item, and add the Manual smoke step.

## What is not verified

- **Which `state` ESPN gives postponed, cancelled and suspended matches.** No real one was seen. Check it against a real one in [The Match bar follows a live match](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/114).
- **How long goals take to reach ESPN.** This was measured only from a home IP, against FotMob and LiveScore: 21 s to 1 min 45 s. From Convex, a goal showed on the first poll after it, but its delay was not measured.
- **Euros coverage.** `uefa.euro` still shows Euro 2024. Check it once Euro 2028 appears.
- **A pin added during a cup match.** The live-match lookup reads the scoreboard of the team's index competition (its domestic league), because `nextEvent` gives no competition for the match being played. A pin added during a match in another competition can still start on the following fixture.
- **A future block.** ESPN may block Convex's shared egress IPs (AWS eu-west-1) at any time. Today they are not blocked.
- **The terms.** These readings are not legal advice.
