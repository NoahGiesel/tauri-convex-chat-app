# What ESPN returns for a team's recent matches and its competitions

Research for [issue #128](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/128), a child of the map [#125](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/125).

**Source.** Every fact below comes from real responses of ESPN's keyless JSON, fetched with plain `curl` on 2026-11-10 between 16:54 and 17:00 UTC. No key and no special headers were sent. 34 requests were made in total, two seconds apart. The raw responses were kept outside the repo and are not committed. ESPN publishes no documentation for this API, so there is no other primary source to cite.

All paths below are relative to `https://site.api.espn.com/apis/site/v2/sports/soccer/`.

Teams checked: Inter (id 110, a club in a league, a European cup and domestic cups), Italy (id 162) and Spain (id 164) as national teams.

## Short answer

- **One call lists a team's finished matches in every competition:** `all/teams/{id}/schedule`. A second call, the same path with `?fixture=true`, lists every scheduled match in every competition.
- **Each entry alone is enough for a row** such as "Inter 2-0 Como, Serie A, 8 Nov". It carries the event id, the kick-off, the competition (slug and name), the round, both teams with logos, the score, the winner and the status.
- **The event id is the same id the scoreboard and the summary use.**
- **A club has no field listing its competitions.** They are the distinct `league.slug` values in the two schedule calls.
- **Old summaries are complete.** A match from August 2015, more than 11 years old, still returned events, lineups and stats.
- **One trap:** in a schedule entry the shoot-out score sits at `competitors[].score.shootoutScore`. The provider module reads `competitors[].shootoutScore` today, so it would miss it.

## Endpoints tried

Sizes are the uncompressed body. "Events" is the length of the `events` array.

### Inter (club, id 110)

| Request | HTTP | Size | Events | What came back |
|---|---|---|---|---|
| `all/teams/110/schedule` | 200 | 184,230 B | 21 | Finished matches of the current season in every competition: Serie A 11, Champions League 4, club friendlies 6. From 2026-07-26 to 2026-11-08. |
| `all/teams/110/schedule?fixture=true` | 200 | 271,301 B | 33 | Scheduled matches in every competition: Serie A 27, Champions League 4, Coppa Italia 1, Supercoppa 1. From 2026-11-22 to 2027-05-30. |
| `ita.1/teams/110/schedule` | 200 | 100,496 B | 11 | Finished Serie A matches only. |
| `ita.1/teams/110/schedule?fixture=true` | 200 | 218,512 B | 27 | Scheduled Serie A matches only. |
| `uefa.champions/teams/110/schedule` | 200 | 37,737 B | 4 | Finished Champions League matches only. |
| `ita.coppa_italia/teams/110/schedule` | 200 | 489 B | 0 | Empty `events`. Inter has not played a cup match yet this season. |
| `ita.coppa_italia/teams/110/schedule?fixture=true` | 200 | 7,579 B | 1 | The round of 16 match on 2026-12-01. |
| `eng.1/teams/110/schedule` | 200 | 518 B | 0 | Empty `events`, HTTP 200, for a league Inter does not play in. |
| `all/teams/110/schedule?season=2025` | 200 | 558,430 B | 62 | All of last season in every competition: Serie A 38, Champions League 10, Coppa Italia 5, Supercoppa 1, Club World Cup 4, club friendlies 4. From 2025-06-18 to 2026-05-23. |
| `ita.1/teams/110/schedule?season=2025` | 200 | 344,844 B | 38 | Last season's Serie A matches. |
| `all/teams/110/schedule?season=2015` | 200 | 398,541 B | 45 | The 2015-16 season in every competition. From 2015-07-21 to 2016-05-14. |
| `all/teams/110/schedule?season=2025&fixture=true` | 200 | 271,301 B | 33 | The same body as `?fixture=true` alone. `season` was ignored and `requestedSeason` said 2026. |
| `all/teams/110` | 200 | 20,312 B | - | The team with one `nextEvent`, as the provider module reads it today. |

### National teams (Italy 162, Spain 164)

| Request | HTTP | Size | Events | What came back |
|---|---|---|---|---|
| `all/teams/162/schedule` | 200 | 228,005 B | 25 | Finished matches from 2024-06-29 to 2026-10-05, across five competition seasons (see [below](#national-team)). |
| `all/teams/162/schedule?fixture=true` | 200 | 21,090 B | 2 | The two Nations League matches of 12 and 15 November 2026. |
| `fifa.friendly/teams/162/schedule` | 200 | 16,431 B | 2 | The two friendlies of June 2026 only. |
| `all/teams/162/schedule?season=2025` | 200 | 228,005 B | 25 | The same body as without `season`. `requestedSeason` said 2026. |
| `all/teams/162/schedule?season=2024` | 200 | 228,005 B | 25 | The same body again. |
| `uefa.euro/teams/162/schedule?season=2024` | 200 | 37,627 B | 4 | All four of Italy's Euro 2024 matches. Here `season` worked. |
| `all/teams/164/schedule` | 200 | 226,137 B | 25 | Spain's finished matches from 2025-03-23 to 2026-10-06, including eight 2026 World Cup matches. |
| `all/teams/162` | 200 | 19,136 B | - | The team with one `nextEvent` (France v Italy, 2026-11-12). |

### Scoreboards and summaries

| Request | HTTP | Size | What came back |
|---|---|---|---|
| `uefa.champions/scoreboard?dates=20261103` | 200 | 100,971 B | 9 matches, among them Feyenoord v Inter with id `401915307`. |
| `ita.1/scoreboard?dates=20250825` | 200 | 23,292 B | 2 matches, among them Inter v Torino with id `736791`. |
| `{league}/summary?event={id}` | 200 | 315 to 447 KB | Nine summaries, listed under [Old summaries](#old-summaries). |

## The response

Top-level keys of a schedule response: `timestamp`, `status` (`"success"`), `season`, `requestedSeason`, `team`, `events`.

- `team` has `id`, `abbreviation`, `displayName`, `logo`, `isNational`, `recordSummary` (`"9-1-1"`), `seasonSummary` (`"2026-27"`) and `standingSummary` (`"2nd in Italian Serie A"`). It has no list of competitions.
- `season` and `requestedSeason` describe one competition's season, also in the `all` response. For Inter it is the home league (`2026-27 Italian Serie A`). For Italy it is `League Phase` of the Nations League.

### One match entry

This is the Champions League match Feyenoord 0-3 Inter, trimmed to the fields a row needs. The full entry is about 9 KB. Most of that weight is `links` and the `links` and second logo of each team.

```json
{
  "id": "401915307",
  "date": "2026-11-03T20:00Z",
  "name": "Internazionale at Feyenoord Rotterdam",
  "shortName": "INT @ FEY",
  "season": { "year": 2026, "displayName": "2026-27 UEFA Champions League" },
  "seasonType": { "id": "1", "type": 14534, "name": "League Phase", "abbreviation": "League Phase" },
  "league": {
    "id": "775",
    "name": "UEFA Champions League",
    "abbreviation": "UEFA Champions League",
    "slug": "uefa.champions",
    "isTournament": true
  },
  "competitions": [
    {
      "id": "401915307",
      "date": "2026-11-03T20:00Z",
      "venue": { "fullName": "De Kuip" },
      "competitors": [
        {
          "id": "142",
          "homeAway": "home",
          "winner": false,
          "team": {
            "id": "142",
            "abbreviation": "FEY",
            "displayName": "Feyenoord Rotterdam",
            "shortDisplayName": "Feyenoord",
            "logos": [{ "href": "https://a.espncdn.com/i/teamlogos/soccer/500/142.png" }]
          },
          "score": { "value": 0.0, "displayValue": "0" }
        },
        {
          "id": "110",
          "homeAway": "away",
          "winner": true,
          "team": {
            "id": "110",
            "abbreviation": "INT",
            "displayName": "Internazionale",
            "shortDisplayName": "Inter Milan",
            "logos": [{ "href": "https://a.espncdn.com/i/teamlogos/soccer/500/110.png" }]
          },
          "score": { "value": 3.0, "displayValue": "3" }
        }
      ],
      "notes": [],
      "status": {
        "displayClock": "90'+4'",
        "type": { "name": "STATUS_FULL_TIME", "state": "post", "completed": true, "detail": "FT" }
      }
    }
  ]
}
```

### Fields, one by one

| Wanted | Where it is | Observed |
|---|---|---|
| Event id | `id` (and `competitions[0].id`) | The same id as the scoreboard and the summary. See [Event ids](#event-ids). |
| Date | `date` | ISO, UTC, to the minute (`2026-11-03T20:00Z`). |
| Competition | `league.slug`, `league.name`, `league.abbreviation` | Present on every entry, also in a per-league call. The Serie A abbreviation is `Serie A`. The Champions League abbreviation is the full name. |
| Round | `seasonType.name` | In a cup: `League Phase`, `Round of 16`, `Quarterfinals`, `Semifinals`, `Final`, `Group Stage`, `Knockout Round Playoffs`, `Playoff Finals`. In a league it repeats the season name (`2026-27 Italian Serie A`). No matchday number was found. |
| Legs and aggregate | `competitions[0].notes[].headline` | `"1st Leg"`, `"2nd Leg - Internazionale advance 3-2 on aggregate"`. Empty for most matches. |
| Both teams | `competitions[0].competitors[]` with `homeAway` and `team` | `team` has `id`, `abbreviation`, `displayName`, `shortDisplayName` and `logos[].href`, the same fields `parseTeam` reads today. |
| Score | `competitors[].score.value` (number) and `.displayValue` (string) | An object, as in `nextEvent`, not the plain string of the scoreboard. A scheduled match has no `score` key at all. |
| Winner | `competitors[].winner` | `true` on the winner, `false` on both sides of a draw. After a shoot-out it marks the shoot-out winner. |
| Shoot-out | `competitors[].score.shootoutScore` (number) | Present only when there was a shoot-out. Manchester City 1 (1), Inter 1 (3), status `STATUS_FINAL_PEN`. |
| Status | `competitions[0].status.type` | `name`, `state`, `completed`, `detail`. Seen: `STATUS_FULL_TIME`, `STATUS_FINAL_PEN`, `STATUS_FINAL_AET` (once) and `STATUS_SCHEDULED`. |
| Kick-off not fixed yet | `timeValid` | `false` on the 19 Serie A fixtures from 2027-01-17 on. Their `date` holds a placeholder hour and `status.type.shortDetail` says `1/17 - TBD`. |

### What the provider module makes of it

The saved responses were run through `parseScoreboard` and `parseSummary` from `convex/espn.ts`, unchanged, with `{ events }` taken from the schedule response.

- All 141 schedule entries parsed (21, 33, 62 and 25): ids, teams, kick-off, state, status name and score were read.
- **No shoot-out was read.** The four `STATUS_FINAL_PEN` entries in those files came out without `shootout`. `parseEvent` looks for `shootoutScore` on the competitor, and the schedule puts it inside `score`.
- `parseEvent` takes the league as an argument. For a schedule it has to come from each entry's `league.slug`, as `fetchNextMatch` already does for `nextEvent`.

## Event ids

Observed:

- `401915307` (Feyenoord v Inter, 2026-11-03) is the id in the team schedule, in `uefa.champions/scoreboard?dates=20261103` and in the summary header.
- `736791` (Inter v Torino, 2025-08-25) is the id in last season's schedule, in `ita.1/scoreboard?dates=20250825` and in the summary header.
- Ids are not ordered by date. Last season's matches have six-digit ids (`737154`), this season's have nine digits (`401874808`), and last season's Coppa Italia final has a nine-digit one (`401838097`).
- **The league in a summary path does not matter.** `all/summary?event=401915307` and `ita.1/summary?event=401915307` (the wrong league) both returned the Champions League match, with the same size (445,594 B) and `header.league.slug` = `uefa.champions`.

## How far back, and in what order

Observed:

- **Finished matches come newest first.** The dates of all three results responses checked were in strict descending order.
- **Scheduled matches come soonest first** (ascending).
- **A club's default call holds the current season only.** For Inter that is 21 matches back to the first summer friendly on 2026-07-26. It is not a "last N" list.
- **`season={year}` returns a whole earlier season** for a club, where the year is the one the season starts in. `season=2025` gave the 62 matches of 2025-26, including the Club World Cup of June 2025. `season=2015` gave 45 matches of 2015-16. No older season was tried.
- **A national team's default call returned exactly 25 matches,** for both Italy and Spain. Italy's reach back 28 months to its last Euro 2024 match (the round of 16; the three group matches before it are missing). Spain's reach back 19 months.
- **`season` did nothing for a national team on `all`.** `season=2025` and `season=2024` returned the same 25 matches. On a single competition it worked: `uefa.euro/teams/162/schedule?season=2024` returned the four Euro 2024 matches.
- **`season` did nothing together with `fixture=true`.**

Guess, not verified: the national-team list is capped at 25 entries. Two teams with the same count suggest it, but nothing in the response says so.

## Response sizes

- A results entry is about 8.8 KB of raw JSON (184,230 B for 21). The trimmed sample above is about 1.2 KB minified, and a stored row with our own field names would be smaller.
- With gzip, `all/teams/110/schedule` was 8,685 B on the wire instead of 184,230 B.
- The largest response seen was a full past season, 558 KB.
- Responses carry `Cache-Control: max-age=2`. The body has a `timestamp`. One response (`eng.1/teams/110/schedule`) had a timestamp 80 minutes older than the request, so some answers are served from a cache.

## How to learn a team's competitions this season

### Club

Observed:

- **No field lists them.** `all/teams/110` has `defaultLeague` (`ita.1`) and `leagueAbbrev` (`ita.1`), and nothing about the Champions League or the cups. The schedule's `team` object has `standingSummary` for the home league only.
- **The schedule entries carry them.** The distinct `league.slug` values for Inter on 2026-11-10:

  | Call | Competitions |
  |---|---|
  | `all/teams/110/schedule` (finished) | `ita.1`, `uefa.champions`, `club.friendly` |
  | `all/teams/110/schedule?fixture=true` (scheduled) | `ita.1`, `uefa.champions`, `ita.coppa_italia`, `ita.super_cup` |

- **Both calls are needed.** The Coppa Italia and the Supercoppa appear only among the fixtures, because Inter has not played in them yet.
- **Each entry names the season too:** `season.displayName` is `2026-27 Coppa Italia`, `2026 Italian Supercoppa`, and so on.
- **`league.isTournament`** is `true` for `uefa.champions`, `ita.coppa_italia` and `fifa.cwc`, and `false` for `ita.1` and `club.friendly`. It is also `false` for `ita.super_cup`, which is a knockout, so it is not a reliable "has no table" flag.
- **An empty per-league answer proves nothing.** `eng.1/teams/110/schedule` returned HTTP 200 with no events, exactly like `ita.coppa_italia/teams/110/schedule` did for a cup Inter is in.
- **Friendlies are in the list** (`club.friendly`), so a competitions list built this way needs to drop them.

Guesses, not verified:

- A cup shows up only once ESPN has a match for the team in it. Before the draw of a first round, the cup is probably absent from both calls.
- After a team is knocked out, its finished matches should keep the cup in the results call until the season ends. This season no checked team had been knocked out yet.

### National team

Observed:

- `all/teams/162` has `defaultLeague` = `uefa.nations`, again a single competition.
- The 25 matches of Italy span five competition seasons: `2026-27 UEFA Nations League`, `2026 International Friendly`, `2026 World Cup Qualifying - UEFA`, `2024-25 UEFA Nations League` and `2024 European Championship`. Spain's also include `2026 FIFA World Cup`.
- So for a national team the distinct slugs are not "this season". Each entry has `season.year` and `season.displayName` to filter on, but the years do not line up: the 2026 World Cup qualifiers have `season.year` 2025, the 2026 friendlies 2026, the 2024-25 Nations League 2024.
- `standingSummary` disagreed between two calls made minutes apart: `"2nd in UEFA Nations League"` in the schedule response, `"15th in UEFA Nations League"` in `all/teams/162`.

## Old summaries

All nine summaries returned HTTP 200 with `keyEvents`, `rosters`, `boxscore`, `commentary` and `header`. Ages are counted to 2026-11-10.

| Match | Date | Age | Key events | Lineups | Stats per team |
|---|---|---|---|---|---|
| Inter v Como, Serie A (`401874808`) | 2026-11-08 | 2 days | 17 | 3-5-2 and 4-2-3-1, 11 starters each, 24 players each | 28 |
| Feyenoord v Inter, Champions League (`401915307`) | 2026-11-03 | 7 days | 26 | 4-3-3 and 3-5-2, 11 starters each | 28 |
| Inter v Monza, Serie A (`401874931`) | 2026-08-22 | 80 days | 31 | 3-5-2 and 3-4-3, 11 starters each | 28 |
| Manchester City v Inter, friendly, shoot-out (`401871493`) | 2026-08-01 | 101 days | 33 | 4-2-3-1 and 3-5-2, 11 starters each | 28 |
| Bologna v Inter, Serie A (`737154`) | 2026-05-23 | 171 days | 22 | 4-3-3 and 3-5-2, 11 starters each | 28 |
| Bosnia-Herzegovina v Italy, World Cup play-off, shoot-out (`761952`) | 2026-03-31 | 224 days | 29 | 4-4-2 and 3-5-2, 11 starters each | 28 |
| Inter v Venezia, Coppa Italia (`759116`) | 2025-12-03 | 342 days | 21 | 3-5-2 and 3-5-2, 11 starters each | 28 |
| Inter v Torino, Serie A (`736791`) | 2025-08-25 | 442 days | 19 | 3-5-2 and 4-3-3, 11 starters each | 28 |
| Inter v Atalanta, Serie A (`432260`) | 2015-08-23 | **11 years, 2 months (4,097 days)** | 18 | 4-3-1-2 and 4-3-3, 11 starters each | 27 |

Observed:

- **`parseSummary` read seven of them, unchanged** (all but `401915307` and `401874931`, which were not run through it). Each gave events, two lineups with a formation, 11 starters and a bench, and all six stats the drawer shows (possession, shots, shots on target, corners, fouls, offsides). The trimmed details were 3.5 to 4.9 KB each.
- **The oldest one differs in one place.** In the 2015 match `formationPlace` (the field that tells where a player stands in the formation) is `null` for every starter. In every other summary all 11 starters of both teams have a value (`"1"` to `"11"`). This matters to the pitch lineup, not to this ticket.
- The 2015 summary has 27 stats per team instead of 28 (`interceptions` is missing). The six stats the drawer shows are there.
- A shoot-out summary has `shootoutScore` on each `header.competitions[0].competitors[]` entry, and a top-level `shootout` key (seen in both shoot-out summaries).

## Upcoming matches

Observed:

- **`?fixture=true` on the same endpoint returns every scheduled match,** in every competition when the league is `all`. For Inter: 33 matches up to the last Serie A round on 2027-05-30. For Italy: 2.
- The first fixture (`401875001`, Atalanta v Inter, 2026-11-22) is the same match and id that `nextEvent` gives in `all/teams/110`.
- Without `fixture=true` the response holds finished matches only. With it, scheduled matches only. No response mixed the two.
- A scheduled entry has the same shape as a finished one, minus `score` and `record` on each competitor. `status.type.state` is `pre`.
- Kick-offs not fixed yet are marked with `timeValid: false` (see the fields table).
- The Champions League fixtures stop at the last league phase match. No later round and no placeholder opponent appeared.

## Not verified

- **A match in progress.** No checked team was playing. Whether a live match appears among the results, among the fixtures, or in neither (as `nextEvent` skips it) is unknown.
- **Postponed, cancelled or abandoned matches.** None appeared in any response. Which of the two lists they land in is unknown.
- **A match decided in extra time, in a schedule entry, was seen once** (`STATUS_FINAL_AET`, the 2026 World Cup final). No club example was checked.
- **The 25-match cap for national teams.** Seen on two teams, not confirmed.
- **Seasons before 2015** for a club, and whether the `season` parameter has a lower bound.
- **A club that joins a cup late or drops between European cups** (for example Champions League to Europa League). Not observed.
- **A cup before its first draw,** and a team already knocked out this season.
- **What the default call returns in the first weeks of a new season,** or in June between two seasons. In August it should hold only the summer friendlies and a round or two, so "recent matches" may need `season={last year}` as well. This is a guess from the dates seen.
- **Clubs outside the five indexed leagues** and second-tier clubs. Only Inter was checked.
- **Convex's egress IPs.** All requests came from a home connection. ADR 0001 records that ESPN answered the existing endpoints from Convex, but the schedule endpoint was not tried from there.
- **Rate limits.** 34 requests two seconds apart all returned HTTP 200. Nothing heavier was tried.
- **The summary of a match with no lineups** (a small friendly or a lower-tier cup match). Every summary checked was complete.
- **Whether `standingSummary` can be trusted,** given the two different values for Italy.
