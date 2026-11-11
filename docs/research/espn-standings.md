# What ESPN returns for standings

Research for [#127](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/127), a child of the map [#125](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/125).

**Source.** Every fact below comes from ESPN's own JSON, fetched with plain `curl` from a home connection, on 2026-11-10 between 16:54 and about 17:03 UTC, and on 2026-11-11 between 17:55 and 19:56 UTC. No key, no cookies and no special headers were sent. The first day's requests were not counted; the sections below name at least 37 of them. The second day made 76: the live watch in [Live behaviour](#live-behaviour), plus a fresh check of `ita.1/standings`, `/site/v2/sports/soccer/ita.1/standings` and `ita.coppa_italia/standings`, which answered as described below (Inter's row unchanged, the same 404, the same empty 200). Each section names the request it rests on, as a path under `https://site.api.espn.com/apis`. The raw responses were not kept in the repo.

Facts I saw are kept apart from guesses. Guesses are marked **Guess**, and the last section lists what was not verified.

## Short answer

- **Endpoint:** `GET https://site.api.espn.com/apis/v2/sports/soccer/{league}/standings`. It is keyless and answers like the endpoints already in use. The same path under `/site/v2` does not exist (404).
- **Shape:** a list of tables in `children[]`. A league gives one table. A group stage gives one table per group. A cup with no table gives a 200 with no `children` at all.
- **A row** has the team (same global ids as elsewhere, Inter is 110), 14 stats (rank, played, won, drawn, lost, goals for, goals against, goal difference, points and a few unused ones) and an optional note for the zone (Champions League, relegation and so on).
- **There is no form** (last five results) in this endpoint.
- **Knockout rounds are never in it.** Once they start, the endpoint keeps returning the league-phase or group table as it ended.
- **Without `season`, ESPN returns the latest season it has a table for**, which can be years old (`uefa.euro` returns Euro 2024).
- **Live:** a table does not change during a match, not even after a goal. It changed once, 4 to 8 minutes after full time. Seen end to end on one Women's Champions League match, and during play on two EFL Trophy matches.

## The endpoint and its parameters

```
GET https://site.api.espn.com/apis/v2/sports/soccer/{league}/standings
```

With the provider module's base URL (`https://site.api.espn.com/apis`) the path is `/v2/sports/soccer/{league}/standings`. `{league}` is the same slug the module already uses (`ita.1`, `uefa.champions`).

| Parameter | What it does | Seen on |
|---|---|---|
| `season` | Picks a season by its year (see [Season](#what-marks-the-season)). Without it, ESPN returns the latest season it has a table for. | `ita.1?season=2025`, `uefa.champions?season=2025`, `uefa.champions?season=2023` |
| `seasontype` | Picks one phase of a season by its id (`1` is the league phase or group stage in most competitions). Without it, ESPN picks a phase itself. | `uefa.champions?season=2025&seasontype=3`, `fifa.worldq.ofc?season=2024&seasontype=2` |
| `sort` | `sort=rank:asc` returns the rows of every table in rank order. Without it, group tables are not in rank order. | `uefa.nations?sort=rank:asc` |

How it answers, compared with the endpoints already in use:

- **Same host, no key.** It answered 200 with `Content-Type: application/json;charset=UTF-8` to a bare `curl`. Sending `accept: application/json`, as `convex/espn.ts` does, gave a byte-identical body (`ita.1`, fetched both ways).
- **It is not under `/site/v2`.** `/site/v2/sports/soccer/ita.1/standings` answered 404 with `{"code":404,"message":"Event ID 'null' not found for sport/league 'soccer/ita.1'"}`.
- **An unknown league is a 400**, with `{"code":400,"message":"Unable to retrieve any standings information for xxx.nope"}`.
- **"No table" is a 200, not an error.** A cup without a table, a season that does not exist and a knockout phase all answer 200 with the `children` field missing. The provider module's rule "a missing field counts as a failure" would wrongly treat these as failures, so the parser must read a missing `children` as "no table".
- **Compression.** The body is gzip-compressed when the client asks for it. The sizes below give both the JSON size and the compressed size.
- **Cache.** Every response carried `Cache-Control: max-age=N` with N between 1 and 60 seconds.

## The shape of a response

Trimmed, from `ita.1/standings`:

```json
{
  "uid": "s:600~l:730",
  "id": "12",
  "name": "Italian Serie A",
  "abbreviation": "Serie A",
  "children": [
    {
      "uid": "s:600~l:730~g:1",
      "id": "1",
      "name": "2026-2027 Italian Serie A",
      "abbreviation": "2026-2027",
      "standings": {
        "id": "0",
        "name": "overall",
        "displayName": "Standings",
        "season": 2026,
        "seasonType": 1,
        "seasonDisplayName": "2026-27 Italian Serie A",
        "entries": [ "...one object per team, see below..." ]
      }
    }
  ],
  "season": {
    "year": 2026,
    "startDate": "2026-06-05T04:00Z",
    "endDate": "2027-07-01T03:59Z",
    "displayName": "2026-27 Italian Serie A"
  },
  "seasons": [
    {
      "year": 2026,
      "startDate": "2026-06-05T04:00Z",
      "endDate": "2027-07-01T03:59Z",
      "displayName": "2026-27 Italian Serie A",
      "types": [
        {
          "id": "1",
          "name": "2026-27 Italian Serie A",
          "startDate": "2026-06-05T04:00Z",
          "endDate": "2027-07-01T03:59Z",
          "hasStandings": true
        }
      ],
      "seasonYears": "2026-27"
    },
    "...24 more seasons, back to 2002..."
  ]
}
```

- **`children[]`** is the list of tables. Each has an `id` (`"1"`, `"2"`, ...), a `name` and a `standings.entries[]` list of rows.
- **`season`** is the season the tables belong to.
- **`seasons[]`** lists every season ESPN knows for the competition, each with its phases in `types[]`. `hasStandings` says whether a phase has a table.

## One row

Inter's row from `ita.1/standings`. From each stat I kept `name`, `value` and `displayValue` and dropped `displayName`, `shortDisplayName`, `description`, `abbreviation` and `type`. From the team I dropped the `links` list and trimmed the logo.

```json
{
  "team": {
    "id": "110",
    "uid": "s:600~t:110",
    "location": "Internazionale",
    "name": "Internazionale",
    "abbreviation": "INT",
    "displayName": "Internazionale",
    "shortDisplayName": "Inter Milan",
    "isActive": true,
    "logos": [
      { "href": "https://a.espncdn.com/i/teamlogos/soccer/500/110.png", "width": 500, "height": 500 }
    ],
    "isNational": false
  },
  "note": { "color": "#81D6AC", "description": "Champions League", "rank": 2 },
  "stats": [
    { "name": "gamesPlayed", "value": 11.0, "displayValue": "11" },
    { "name": "losses", "value": 1.0, "displayValue": "1" },
    { "name": "pointDifferential", "value": 15.0, "displayValue": "+15" },
    { "name": "points", "value": 28.0, "displayValue": "28" },
    { "name": "pointsAgainst", "value": 13.0, "displayValue": "13" },
    { "name": "pointsFor", "value": 28.0, "displayValue": "28" },
    { "name": "ties", "value": 1.0, "displayValue": "1" },
    { "name": "wins", "value": 9.0, "displayValue": "9" },
    { "name": "advanced", "value": 0.0, "displayValue": "0" },
    { "name": "deductions", "value": 0.0, "displayValue": "" },
    { "name": "ppg", "value": 0.0, "displayValue": "0" },
    { "name": "rank", "value": 2.0, "displayValue": "2" },
    { "name": "rankChange", "value": 0.0, "displayValue": "0" },
    { "name": "overall", "value": null, "displayValue": "9-1-1" }
  ]
}
```

A row has exactly three fields: `team`, `stats` and, for some rows, `note`.

### The fields the ticket asks about

Stats are a list, not an object, so a parser must look each one up by `name`.

| Wanted | ESPN stat `name` | Note |
|---|---|---|
| Rank | `rank` | A stat like the others. It is not the position in the list (see [Row order](#row-order)). |
| Played | `gamesPlayed` | |
| Won | `wins` | |
| Drawn | `ties` | |
| Lost | `losses` | |
| Goals for | `pointsFor` | |
| Goals against | `pointsAgainst` | |
| Goal difference | `pointDifferential` | `displayValue` carries the sign (`"+15"`). |
| Points | `points` | |
| Form | none | **Not in this endpoint.** See [Form](#form). |
| Note | `note` on the row, not a stat | See [Notes and zones](#notes-and-zones). |

The other five stats:

- **`overall`** is the record as text, `"9-1-1"`, in the order won-drawn-lost. Its `value` is always `null`.
- **`deductions`** was 0 in every row I saw (615 rows). Its `displayValue` is then an empty string.
- **`ppg`** and **`rankChange`** were 0 in every row I saw, in every competition, also in the middle of a season. They carry nothing.
- **`advanced`** was 1 for exactly the 32 teams that went through the groups of the 2026 World Cup, and 0 everywhere else, including the finished 2025-26 Champions League, Euro 2024 and the World Cup qualifiers. It cannot be relied on.

All 615 rows in the 21 responses that had tables carried the same 14 stats, in the same order, and the same team fields. Every row had a logo.

### Row order

- **A league table comes in rank order** (`ita.1`, `eng.1`, `uefa.champions`, `fifa.worldq.conmebol`).
- **Group tables do not.** In every response with groups the rows came in team-id order (Nations League group A1: Italy rank 2, Belgium rank 3, Türkiye rank 4, France rank 1).
- `sort=rank:asc` puts group rows in rank order. Sorting by the `rank` stat on our side does the same without relying on the parameter.

### How a row identifies its team

- `team.id` is a string holding **the same global id used by the other endpoints**. Inter is `"110"` in `ita.1/standings`, in `uefa.champions/standings` and in the Champions League 2023-24 groups. That is the id the spec records for `/all/teams` and the scoreboards.
- For national teams I checked Italy: `"162"` in `uefa.nations`, `uefa.euro`, `fifa.worldq.uefa` and `uefa.euroq`, and `/site/v2/sports/soccer/all/teams/162` answers "Italy".
- The row also has `displayName`, `shortDisplayName`, `abbreviation`, one 500 px logo and `isNational`. So a team that is not pinned can be drawn as a table row from the standings response alone, with no lookup in `footballTeams`.
- `isNational` is not fully reliable. It was `false` on every club row and `true` on 317 of 323 national-team rows, but `false` for Curaçao (in `fifa.world` and `fifa.worldq.concacaf`) and for South Sudan, Zimbabwe, Sao Tome and Principe and the Central African Republic (in `fifa.worldq.caf`).
- Women's teams have their own ids (Chelsea Women is `19970`), so a women's table never matches a men's Team pin.

### Notes and zones

A row may have `note: { color, description, rank }`. `rank` repeats the row's rank. The note is tied to the **position**, not to what has happened: 11 matches into the season, Serie A's 18th to 20th already say "Relegated", and the Champions League's 25th to 36th say "Eliminated" after 4 of 8 matches. It is a zone label, not a result.

Labels seen (English only):

| Competition | Labels, by rank |
|---|---|
| `ita.1` | 1-4 Champions League; 5-6 Europa League; 7 Conference League qualifying; 18-20 Relegated |
| `eng.1` | 1-4 Champions League; 5 Europa League; 18-20 Relegation |
| `esp.1` | 1-5 Champions League; 6 and 10 Europa League; 7 Conference League qualifying; 18-20 Relegation |
| `ger.1` | 1-4 Champions League; 5-6 Europa League; 7 Conference League qualifying; 16 Relegation playoff; 17-18 Relegation |
| `fra.1` | 1-3 Champions League; 4 Champions League qualifying; 5-6 Europa League; 7 Conference League qualifying; 16 Relegation playoff; 17-18 Relegation |
| `uefa.champions`, `uefa.europa`, `uefa.europa.conf` | 1-8 Qualifies for round of 16; 9-16 Knockout phase playoffs - seeded; 17-24 Knockout phase playoffs - unseeded; 25-36 Eliminated |
| `fifa.world` (2026) | 1-2 Advance to Round of 32; 3 Best 8 advance; 4 Eliminated |
| `uefa.euro` (2024) | 1-2 Qualifies for round of 16; 3 Four best 3rd placed nations qualify for round of 16; 4 has no note |
| `uefa.nations` | Group A1 only: 1 "A: Qualifies for QFs; B-D: Promotion"; 2 "A: Qualifies for QFs; B-D: Promotion playoffs"; 3 "A, B: Relegation playoffs"; 4 "A, B: Relegation; C: Relegation or playoffs". **The other 13 groups have no notes at all.** |
| `fifa.worldq.uefa` | 1 Qualifies for World Cup; 2 Qualifies for World Cup playoffs |
| `fifa.worldq.conmebol` | 1-6 Qualifies for World Cup; 7 Inter-confederation playoffs |
| `uefa.euroq` (2023) | No notes on any row |

The notes are not clean data:

- **The wording differs between leagues** for the same thing: "Relegated" in Serie A, "Relegation" in the other four.
- **The colour is not always valid.** `eng.1` rank 5 has `"##B5E7CE"` and `esp.1` rank 10 has `"##c6d1e0"`, with two `#`.
- **A description can carry stray whitespace.** The 2023-24 Champions League groups have `"Europa League knockout round playoffs\t"`, ending in a tab.
- **Notes can be missing** for a whole competition (`uefa.euroq`) or for most of its groups (`uefa.nations`).
- Six colours appeared: `#81D6AC` (the top zone), `#B5E7CE` (a second-best zone), `#B2BFD0` and `#c6d1e0` (a lesser zone), `#FEB4B5` (a relegation playoff) and `#FF7F84` (relegation or elimination).

### Form

No field of the standings response holds the last results of a team.

A form string does exist elsewhere: on the scoreboard, each competitor of a match has `form`, such as `"DWWWW"` (`/site/v2/sports/soccer/all/scoreboard` and `/site/v2/sports/soccer/uefa.wchampions/scoreboard`). It is only there for the teams that play in the returned matches, and a few competitors had none or a shorter one (`"L"`, `"DD"`). I did not check in which order the letters run.

## Each competition checked

All with no `season` parameter, on 2026-11-10. "JSON" is the size of the body, "gzip" the size on the wire when compression is asked for (measured on the wire where marked `*`, otherwise from compressing the saved body, which matched the wire to within a few bytes where both were measured).

| League slug | What came back | Season returned | JSON | gzip |
|---|---|---|---|---|
| `ita.1` | One table, 20 rows | 2026-27, in progress (11 played) | 68 KB | 4.2 KB * |
| `eng.1` | One table, 20 rows | 2026-27, in progress | 69 KB | 4.2 KB |
| `esp.1` | One table, 20 rows | 2026-27, in progress | 69 KB | 4.3 KB |
| `ger.1` | One table, 18 rows | 2026-27, in progress | 64 KB | 4.2 KB |
| `fra.1` | One table, 18 rows | 2026-27, in progress | 63 KB | 4.2 KB |
| `uefa.champions` | One table "League Phase", 36 rows | 2026-27, league phase in progress (4 played) | 144 KB | 7.6 KB |
| `uefa.europa` | One table "League Phase", 36 rows | 2026-27, league phase in progress | 135 KB | 7.1 KB |
| `uefa.europa.conf` | One table "League Phase", 36 rows | 2026-27, league phase in progress | 117 KB | 5.4 KB |
| `ita.coppa_italia` | **Nothing**: 200, no `children`, `seasons: []` | 2026-27 | 221 B | 0.2 KB |
| `eng.fa` | **Nothing**: 200, no `children`, `seasons: []` | 2026-27 | 225 B | 0.2 KB |
| `fifa.world` | 12 groups ("Group A" to "Group L"), 4 rows each | 2026, finished in July | 169 KB | 7.9 KB * |
| `uefa.euro` | 6 groups, 4 rows each | **2024**, finished | 80 KB | 3.9 KB * |
| `uefa.nations` | 14 groups ("Group A1" to "Group D2"), 54 rows | 2026-27, league phase in progress (4 played) | 171 KB | 7.1 KB * |
| `fifa.worldq.uefa` | 12 groups, 54 rows | "2026 World Cup Qualifying - UEFA" (year 2025), finished | 170 KB | 7.3 KB * |
| `fifa.worldq.conmebol` | One table, 10 rows | 2026 qualifying (year 2023), finished | 33 KB | 2.5 KB * |
| `fifa.worldq.concacaf` | 3 groups, 4 rows each (the third round only) | 2026 qualifying (year 2024), finished | 45 KB | 3.2 KB * |
| `fifa.worldq.caf` | 9 groups, 6 rows each | 2026 qualifying (year 2023), finished | 170 KB | 7.5 KB * |
| `fifa.worldq.afc` | 2 groups, 3 rows each (the fourth round only) | 2026 qualifying (year 2023), finished | 25 KB | 2.3 KB * |
| `fifa.worldq.ofc` | **Nothing**: 200, no `children` | 2026 qualifying (year 2024), finished | 3.6 KB | 0.6 KB * |
| `uefa.euroq` | 10 groups, 53 rows | **Euro 2024 qualifying** (year 2023), finished | 165 KB | 7.2 KB * |
| `fifa.friendly` | **Nothing**: 200, no `children` | 2027 | 572 B | 0.3 KB * |
| `xxx.nope` (made up) | **Error**: 400 with a JSON message | | 82 B | 0.1 KB * |

Variants, with parameters:

| Request | What came back | JSON |
|---|---|---|
| `ita.1?season=2025` | The final 2025-26 table, 20 rows, 38 played | 69 KB |
| `ita.1?season=2027` and `ita.1?season=2001` | 200, no `children`, **no `season`**, only the list of seasons. The two bodies were identical. | 8 KB |
| `uefa.champions?season=2025` | The final 2025-26 league-phase table, 36 rows, 8 played | 144 KB |
| `uefa.champions?season=2025&seasontype=3` (round of 16) | 200, no `children` | 34 KB |
| `uefa.champions?season=2023` | 8 groups of 4 (the old format) | 134 KB |
| `ita.coppa_italia?season=2025` | Nothing, as without the parameter | 221 B |
| `fifa.worldq.ofc?season=2024&seasontype=2` | 2 groups of 4 | 28 KB |
| `uefa.euro?season=2028` | 200, no `children`, no `season` | 5 KB |

About size: a row is about 3 KB of JSON, almost all of it the repeated stat labels and the team's links. The `seasons` list adds about 8 KB to a league response and up to 34 KB to a Champions League one. **Guess:** a row cut down to what a table shows (rank, team id, name, abbreviation, eight numbers and a note) is about 150 bytes, so a stored table is 3 KB for 20 teams and 5 to 6 KB for 36.

## By kind of competition

### Domestic leagues

`ita.1`, `eng.1`, `esp.1`, `ger.1` and `fra.1` each return one table for the current season, in rank order, with zone notes. The table's `name` is the season label and is not uniform ("2026-2027 Italian Serie A", "2026-27 LALIGA", "French Ligue 1 2026-27"), so it is of no use as a title.

### European cups

In the league phase, `uefa.champions`, `uefa.europa` and `uefa.europa.conf` each return **one table of 36 rows** named "League Phase", in rank order, with a note on every row.

The season's phases are listed in `seasons[].types[]`. For the 2026-27 Champions League: League Phase (`hasStandings: true`, until 2027-02-15), then Knockout Round Playoffs, Round of 16, Quarterfinals, Semifinals and Final, all `hasStandings: false`, each with its start and end date.

**Once the knockout rounds start**, I could not watch it happen, because no target competition is in its knockout rounds today. What I saw instead:

- `uefa.champions?season=2025`, a season whose knockout rounds are over, returns the league-phase table as it ended (36 rows, 8 played, Arsenal first with 24 points). Nothing in it says who went on or who won.
- `uefa.champions?season=2025&seasontype=3` (the round of 16) returns no `children`.
- `fifa.world` today, months after the final, returns the 12 group tables.
- `fifa.worldq.afc` returns the tables of its fourth round, the last phase that had tables, although a fifth round (`hasStandings: false`) is listed after it.

**Guess**, from those four: during the knockout rounds the plain request keeps returning the final league-phase table, and the endpoint never returns a bracket or any knockout result. Knockout matches have to come from somewhere else (the scoreboard, or the team's matches).

Before 2024-25 the Champions League had groups, and `season=2023` returns 8 tables named "Group A" to "Group H". So the same slug can return one table or several, depending on the season's format.

### Domestic cups

`ita.coppa_italia` and `eng.fa` return a 200 with the competition's name and current `season`, an empty `seasons` list and no `children`:

```json
{"uid":"s:600~l:3956","id":"2192","name":"Coppa Italia","abbreviation":"Coppa Italia","season":{"year":2026,"startDate":"2026-07-01T04:00Z","endDate":"2027-07-01T03:59Z","displayName":"2026-27 Coppa Italia"},"seasons":[]}
```

### National teams

- **World Cup qualifying, by confederation.** The slugs are `fifa.worldq.uefa`, `.conmebol`, `.concacaf`, `.caf`, `.afc` and `.ofc`. All six still return the **2026 World Cup qualifying, which is finished**. No 2030 qualifying exists yet. UEFA and CAF return groups, CONMEBOL returns one table of 10. Concacaf and AFC had several rounds with tables and return only the last one. OFC returns nothing by default, though `seasontype=2` returns its two groups. **Guess:** the plain request picks the last phase flagged `hasStandings: true`, which for OFC is the semifinals, and that phase has no table.
- **Nations League.** `uefa.nations` returns the 2026-27 edition, in its league phase today: 14 tables named "Group A1" to "Group D2" (12 groups of 4 and 2 of 3). The league (A, B, C, D) is only readable from the group's name. Notes are present on group A1 only. Its phases after the league phase (quarterfinals, relegation playoffs, semifinals, final) have `hasStandings: false`.
- **Final tournaments.** `fifa.world` returns the 12 groups of the 2026 World Cup. `uefa.euro` returns the 6 groups of Euro 2024, because Euro 2028 does not exist yet in ESPN (`season=2028` returns nothing). `uefa.euroq` likewise returns the Euro 2024 qualifying groups.
- **Group names are not uniform.** Most are "Group A". CAF's are `"2026 FIFA World Cup¤ CAF Qualifying - Group A"`, with a stray `¤` character and an `abbreviation` cut off at 32 characters. Concacaf's `name` has the same long form but its `abbreviation` is "Group A".
- **Which group a team is in.** `/site/v2/sports/soccer/all/teams/162` (the endpoint already used for the next match) answers for Italy `defaultLeague.slug: "uefa.nations"`, `groups.id: "1"` and `standingSummary: "15th in UEFA Nations League"`. Group A1 is the child with `id: "1"` in `uefa.nations/standings`. **Guess:** `groups.id` is the id of the team's table in its default league's standings. I checked it for this one team only.

## What marks the season

- **`season.year`** at the top, and **`standings.season`** on each table, hold the year the season **starts** in: `2026` for 2026-27. That is also the value the `season` parameter takes.
- For national-team qualifying the year is ESPN's own and not obvious: `2023` for the CONMEBOL, CAF and AFC qualifying of the 2026 World Cup, `2024` for Concacaf and OFC, `2025` for UEFA.
- **`season.displayName`** and `standings.seasonDisplayName` are the readable label ("2026-27 Italian Serie A", "2026 FIFA World Cup").
- **`season.startDate` and `season.endDate`** bound the season. **`standings.seasonType`** is the id of the phase the table belongs to, and `seasons[].types[]` gives each phase's name, dates and `hasStandings`.

**A finished season** looks exactly like a running one. `ita.1?season=2025` has the same fields as today's table, with 38 matches played. There is no "final" or "completed" flag. The only signs are that `season.endDate` (or the phase's `endDate`) is in the past and that every team has played all its matches.

**The plain request does not mean "the current season".** It returns the latest season ESPN has a table for. For Serie A that is the running one. For `uefa.euro` it is 2024, and for the World Cup qualifiers it is a campaign that ended a year ago. So a table must be checked against `season.endDate` before it is shown as current.

**A season that has not started**, or does not exist, returns a 200 with no `children` and no `season` field (`ita.1?season=2027`, `uefa.euro?season=2028`). I could not see a season that exists but has no match played yet, because none of the target competitions is in that state in November.

## Live behaviour

**The table changes only after full time, a few minutes after the scoreboard shows FT.** No match in progress is counted in it, not even after a goal.

### One match end to end

OH Leuven v HB Køge (event `401916985`), Women's Champions League league phase, kick-off 17:45 UTC on 2026-11-11. Every 4 minutes from 17:55 to 19:52 UTC I read `/v2/sports/soccer/uefa.wchampions/standings` together with `/site/v2/sports/soccer/uefa.wchampions/scoreboard`: 30 pairs.

| UTC | Scoreboard | OH Leuven row | HB Køge row |
|---|---|---|---|
| 17:55 | 10', 0-0 | rank 18, played 3, drawn 1, goals 1-10, 1 pt | rank 12, played 3, drawn 0, goals 5-10, 3 pts |
| 19:20 | 79', 0-0 | unchanged | unchanged |
| 19:24 | 83', 1-1 | unchanged | unchanged |
| 19:32 | 90'+1', 1-1 | unchanged | unchanged |
| 19:36 | FT, 1-1 | unchanged | unchanged |
| 19:40 | FT, 1-1 | rank 17, played 4, drawn 2, goals 2-11, 2 pts | rank 10, played 4, drawn 1, goals 6-11, 4 pts |

- **During play nothing moved.** The 26 tables read from 17:55 to 19:36 were identical, row for row. At 0-0 neither team had a match more played, and after the two goals neither had a goal more.
- **The update came in one step**, between 19:36:15 and 19:40:16 UTC. The scoreboard had switched to FT between 19:32 and 19:36, so the table followed 4 to 8 minutes after the final whistle, and the first read after FT still had the old table.
- **Only the rows changed.** The two teams got their match, and Roma, Internazionale and Austria Vienna moved one rank because of it. Everything outside `entries` was identical before and after.
- **`rankChange` stayed 0** for all five teams whose rank moved, which confirms it carries nothing.
- `Cache-Control: max-age` stayed between 11 and 60 seconds. **Guess:** the lag is ESPN's own processing, not the cache, since the cache lasts at most a minute.
- The Women's Champions League table has no `note` on any row (18 rows).

### A second competition, during play only

The EFL Trophy (`eng.trophy`, 16 group tables of 4, no notes, 209 KB of JSON) had two matches from 19:00 UTC: Barnsley v Oldham Athletic (Northern Group G) and Sheffield Wednesday v Accrington Stanley (Northern Group A). I read its standings and scoreboard before kick-off, at 15', 25', 35' and 45', and at half-time (19:55 UTC). At half-time the scoreboard said Barnsley 3-0 and Accrington 2-0 up, and the four rows were still the same as before kick-off. These matches ended after the watch, so their update after full time was not read.

### What it means for the app

The standings endpoint cannot show a match in progress. **Guess:** a table that should reflect the pinned team's last match is best read again once that match is over, and read once more some minutes later if the team's played count has not gone up yet, because the first read after FT can still hold the old table.

## Not verified

- **A season that exists but has not kicked off.** Whether ESPN then returns a table of zeros, last season's table or nothing. No target competition is in that state in November.
- **The plain request during the knockout rounds of a running season.** It is a guess from finished seasons that it keeps returning the league-phase table. To be checked in February 2027 on `uefa.champions`.
- **The switch from one season to the next.** On which day the plain `ita.1` request starts to return the new season, and what it holds in the weeks between.
- **A points deduction.** `deductions` was 0 in all 615 rows, so I did not see how a deducted team looks, or whether `points` already includes the deduction.
- **Tie-breaks.** Whether ESPN's `rank` follows each competition's own rules (head-to-head in Serie A and LaLiga). I did not compare with an official table.
- **Level points during a season.** Whether two teams ever share a rank.
- **A domestic cup with a group stage**, or a cup's earlier seasons. Only `ita.coppa_italia` and `eng.fa` were checked, for 2026-27 and (Coppa Italia) 2025-26.
- **Other parameters.** Only `season`, `seasontype` and `sort` were tried. ESPN may have others (home and away tables, for example).
- **Convex's egress IPs.** All requests came from a home connection. ADR 0001 says the other endpoints answer from Convex as they do from home, but this endpoint was not tried from there.
- **Rate limits.** Every request on both days was answered, including 30 pairs 4 minutes apart. Nothing more is known.
- **The order of the letters in `form`** on the scoreboard, and whether it counts all competitions.
- **What `groups.id` on `/all/teams/{id}` means for a club** that plays in a league and in a European cup at once. It was read for Italy only.
- **Live behaviour beyond one match.** The update after full time was seen on one Women's Champions League match only. Not seen: a men's league such as `ita.1`, a match decided on penalties, a match that is suspended or abandoned, and several matches of one round ending at once. The lag of 4 to 8 minutes is one sample, not a bound.
