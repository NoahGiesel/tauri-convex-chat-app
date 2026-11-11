# What ESPN returns for a player's place on the pitch

Research for [issue #126](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/126), a child of the map [#125](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/125).

**Source.** Every fact below comes from real responses of ESPN's keyless JSON, fetched with plain `curl` on 2026-11-11 between 17:55 and 20:02 UTC. No key and no special headers were sent. 134 requests were made in total, at least two seconds apart. The raw responses were kept outside the repo and are not committed. ESPN publishes no documentation for this API, so there is no other primary source to cite. Where this file says "guess", nothing in a response proves it.

All paths below are relative to `https://site.api.espn.com/apis/site/v2/sports/soccer/`. Every summary was fetched as `all/summary?event={id}` (the sibling finding [espn-recent-matches.md](https://github.com/NoahGiesel/tauri-convex-chat-app/blob/research/espn-recent-matches/docs/research/espn-recent-matches.md#event-ids) showed that the league in the path does not matter).

## Short answer

- **Yes, the lineups can be drawn on a pitch from ESPN alone.** Each starter has `formationPlace` (`"1"` to `"11"`) and `position.abbreviation` (`G`, `CD-L`, `RB`, `AM-R`, `CF-L`, ...). Each side has a `formation` string (`3-5-2`).
- **`formationPlace` is a slot number whose meaning depends on the formation.** It is not a row order: in a 3-5-2, places 2 and 3 are the wing-backs and 4 to 6 the centre-backs. Within one formation the numbering never changed: every side with full labels gave the same place the same label, in every league, for national teams and in women's matches.
- **The rule that turns them into rows** (checked on all 58 modern post-match sides, 11 formations, and on 10 women's sides during their matches): sort the 10 outfield starters by the depth of their label, cut that list by the numbers of the formation string, then order each row by the side of the label (`L` ... `R`). The [rule](#the-rule) and a [table of places per formation](#the-places-of-each-formation) are below.
- **Before kick-off the labels are often useless, the places are not.** On 7 of 10 sides seen before kick-off, the labels stayed `SUB` on all starters or only `G`, `D`, `M`, `F` until kick-off, while `formationPlace` was already `1` to `11` and did not change at kick-off. So the app should place starters from `formation` + `formationPlace` with the table, and use the labels only for a formation that is not in the table.
- **The formation and the places can change during a match.** Aston Villa went from 3-4-2-1 to 4-4-2 at 12 minutes, and 8 of its 10 outfield starters got a new place. The pitch view has to follow the latest summary, not keep the pre-match one.
- **A substitution names who came on for whom, and the minute, but not the place of the player who came on.** He has `formationPlace` `"0"` and the label `SUB`, also during the match.
- **Per player there are goals, assists, cards, own goals, saves and more** (`stats` and `plays`), a jersey image on every player, and a headshot on only 7% of them. **There is no captain field.**
- **Lineups appeared 42 to 63 minutes before kick-off** on the 6 sides watched from before they were out (women's matches: no men's match of the followed competitions was played that evening). On half of them the names came first with every place `"0"` and the places one poll (5 minutes) later. Full labels came at kick-off on 5 of the 6.
- **The recorded fixture has `position.abbreviation` but none of the rest:** no `formationPlace`, no substitution fields, no stats, no headshot.
- **Side finding:** a summary without lineups has `rosters` entries with no `roster` key at all, and `parseSummary` throws `ESPN: rosters[].roster missing` on it. Today no details are stored for a match until its lineups are out, and never for a match that has no lineups.

## Requests made

Sizes are the uncompressed body.

| Request | HTTP | Size | Why |
|---|---|---|---|
| `all/summary?event=401874808` | 200 | 417,680 B | Inter v Como, Serie A, 2026-11-08 (3-5-2 v 4-2-3-1) |
| `all/summary?event=401915307` | 200 | 444,151 B | Feyenoord v Inter, Champions League, 2026-11-03 (4-3-3 v 3-5-2) |
| `all/summary?event=761952` | 200 | 438,822 B | Bosnia-Herzegovina v Italy, World Cup play-off, 2026-03-31 (4-4-2 v 3-5-2) |
| `all/summary?event=760517` | 200 | 486,677 B | Argentina v Spain, World Cup final, 2026-07-19 (4-4-2 v 4-2-3-1) |
| `all/summary?event=401874810` | 200 | 432,878 B | Napoli v Lazio, Serie A: the match of the recorded fixture (3-4-2-1 v 4-3-3) |
| `all/summary?event=432260` | 200 | 382,334 B | Inter v Atalanta, Serie A, 2015-08-23 (the old match of the sibling finding) |
| `{eng.1,esp.1,ger.1,fra.1}/scoreboard?dates=20261108` | 200 | 37 to 66 KB | The matches of the last league weekend |
| `uefa.europa/scoreboard?dates=20261105` | 200 | 195,045 B | Europa League matchday |
| `all/summary?event={id}` for 19 league and 5 Europa League matches | 200 | 376 to 448 KB | More formations (all in the [tally](#the-places-of-each-formation)) |
| `fifa.friendly/scoreboard?dates=20261111`, `uefa.nations/scoreboard?dates=20261112`, `all/scoreboard?dates=20261111` | 200 | 7 to 453 KB | Matches about to start, to see when lineups appear |
| `all/summary?event={id}` for 8 matches not started yet | 200 | 91 to 159 KB | First look before kick-off |
| `all/summary?event={401923292,401923380,401916984}`, every 5 minutes from 17:57 to 20:02 | 200 | 91 to 291 KB | [When lineups appear](#when-lineups-appear): Liverpool v Aston Villa (19:00), Brighton v Watford (19:45), Juventus v Lyon (20:00), all women's |
| `all/summary?event={401928151,401928152}` at 18:04 and 19:15 | 200 | 131 to 276 KB | The two women's Europa Cup matches at 4 and about 60 minutes |
| `all/summary?event={401930244,401932726,401932727}` | 200 | 58 to 87 KB | Three small national-team matches of the day, finished, looking for a missing formation |
| One headshot, one guessed headshot URL, one jersey image | 200, 404, 200 | | Whether the image URLs work |

In all, 58 modern sides were read after full time, from 29 summaries of Serie A, Premier League, LaLiga, Bundesliga, Ligue 1, Champions League, Europa League, the 2026 World Cup and a World Cup play-off. The 2015 match (2 sides) is set apart below.

## The roster entry

Each summary has `rosters`, one entry per team, with `homeAway`, `winner`, `team`, `uniform`, `formation` and `roster`. This is Inter's entry in Inter v Como, trimmed to a starter and the player who replaced him. A full player entry is about 7 KB (the `rosters` of this summary are 185 KB of its 415 KB).

```json
{
  "homeAway": "home",
  "team": { "id": "110", "displayName": "Internazionale" },
  "formation": "3-5-2",
  "roster": [
    {
      "active": true,
      "starter": true,
      "jersey": "32",
      "athlete": { "id": "194748", "displayName": "Federico Dimarco", "shortName": "F. Dimarco", "jerseyImages": ["2 images"] },
      "position": { "name": "Left Midfielder", "displayName": "Left Midfielder", "abbreviation": "LM" },
      "formationPlace": "3",
      "subbedIn": false,
      "subbedOut": true,
      "subbedOutFor": { "jersey": "17", "athlete": { "id": "319167", "displayName": "Andy Diouf" } },
      "stats": ["14 entries"],
      "plays": [
        { "clock": { "displayValue": "87'" }, "scoringPlay": false, "substitution": true, "redCard": false, "yellowCard": false, "penaltyKick": false, "ownGoal": false }
      ]
    },
    {
      "active": true,
      "starter": false,
      "jersey": "17",
      "athlete": { "id": "319167", "displayName": "Andy Diouf", "shortName": "A. Diouf", "jerseyImages": ["2 images"] },
      "position": { "name": "Substitute", "displayName": "Substitute", "abbreviation": "SUB" },
      "formationPlace": "0",
      "subbedIn": true,
      "subbedOut": false,
      "subbedInFor": { "jersey": "32", "athlete": { "id": "194748", "displayName": "Federico Dimarco" } },
      "stats": ["14 entries"],
      "plays": [
        { "clock": { "displayValue": "87'" }, "scoringPlay": false, "substitution": true, "redCard": false, "yellowCard": false, "penaltyKick": false, "ownGoal": false }
      ]
    }
  ]
}
```

Keys seen on a player, over all modern summaries: `active`, `starter`, `jersey`, `athlete`, `position`, `subbedIn`, `subbedOut`, `formationPlace`, `media` (always empty), `stats`, `plays`, `subbedInFor`, `subbedOutFor`. Keys seen on `athlete`: `id`, `uid`, `guid`, `lastName`, `fullName`, `displayName`, `shortName`, `links`, `jerseyImages`, `headshot`.

Nothing else in the summary places a player. `fieldPositionX` / `fieldPositionY` exist, but on key events and commentary (where a shot was taken), not on players.

## Placing the starters

### What the fields say

Observed on the 58 modern post-match sides:

- Every starter has `formationPlace` from `"1"` to `"11"`, a string, each number once per side. Place `"1"` is always the goalkeeper (`G`).
- Every player on the bench has `formationPlace` `"0"` and the label `SUB`, also the ones who came on.
- **For one formation, place N always has the same label.** All 25 sides in a 4-2-3-1 have `4:LM 8:RM` for the two holding midfielders and `7:AM-R 10:AM 11:AM-L` behind the striker `9:F`. The same holds for every formation seen more than once, across leagues and national teams. So the label is a name for the slot, not the player's own position.
- **The place number does not follow the rows.** In every back four, places 2 and 3 are the full-backs and 5 and 6 the centre-backs, while place 4 is a midfielder. In a 3-5-2, places 2 and 3 are the wing-backs.
- **The same place can mean a different slot in another formation.** Place 4 is a centre-back in a 3-5-2, a holding midfielder in a 4-2-3-1, and the central midfielder in a 4-3-3. In the one 3-1-4-2 seen, the three centre-backs are places 6, 4 and 5, not 4, 5 and 6.
- **3-4-3 and 3-4-2-1 have the same places and labels** (`9:F 10:CF-R 11:CF-L`). Only the formation string tells whether the three forwards stand in one row or in two.
- `L` and `R` in a label are the team's own left and right, facing the opponent's goal. This matches known roles: Dimarco (left wing-back) is `LM`, Spence (right wing-back) is `RM`, Como's left-back Valle is `LB`.

### The rule

Checked on all 58 modern post-match sides: it gave the right number of players in each row, a depth class never had to be split between two rows, and no two players in one row tied on side.

1. The goalkeeper is the starter with `formationPlace` `"1"` (label `G`). He is the first row.
2. Give each of the other 10 starters a depth from his label:

   | Depth | Labels |
   |---|---|
   | 1 | `CD`, `CD-L`, `CD-R`, `LB`, `RB` |
   | 2 | `DM`, `SW` |
   | 3 | `CM`, `CM-L`, `CM-R`, `LM`, `RM`, `M` |
   | 4 | `AM`, `AM-L`, `AM-R` |
   | 5 | `CF-L`, `CF-R`, `RCF` |
   | 6 | `F`, `LF`, `RF` |

   `SW` is a holding midfielder here, not a sweeper: it is the "1" of 4-1-3-2 and 3-1-4-2. `F` gets the highest depth: it is the lone striker in front of `CF-L`/`CF-R` in 3-4-2-1 and 4-3-2-1, and in front of `RCF` in 4-4-1-1.
3. Sort them by depth. Split the formation string on `-` (`4-2-3-1` gives 4, 2, 3, 1) and cut the sorted list into rows of those sizes, from the back.
4. Order each row from left to right by side: `LB`/`LM`/`LF` (wide left), then labels ending `-L`, then the centre (no `L` or `R`), then `-R` and `RCF`, then `RB`/`RM`/`RF` (wide right).

Before kick-off the labels may not be there (see [below](#before-kick-off)), so the app should rather use the same result as a fixed table, keyed by the formation string and `formationPlace`. The rule is the fallback for a formation the table does not have.

### The places of each formation

Each row lists `formationPlace` (label), left to right, from the goalkeeper up. "Sides" is how many of the 58 sides played it.

| Formation | Sides | Rows |
|---|---|---|
| 4-2-3-1 | 25 | 1 \| 3(LB) 6(CD-L) 5(CD-R) 2(RB) \| 4(LM) 8(RM) \| 11(AM-L) 10(AM) 7(AM-R) \| 9(F) |
| 4-3-3 | 8 | 1 \| 3(LB) 6(CD-L) 5(CD-R) 2(RB) \| 8(LM) 4(CM) 7(RM) \| 11(LF) 9(F) 10(RF) |
| 3-4-2-1 | 7 | 1 \| 4(CD-L) 5(CD) 6(CD-R) \| 3(LM) 8(CM-L) 7(CM-R) 2(RM) \| 11(CF-L) 10(CF-R) \| 9(F) |
| 3-5-2 | 5 | 1 \| 4(CD-L) 5(CD) 6(CD-R) \| 3(LM) 8(CM-L) 11(AM) 7(CM-R) 2(RM) \| 9(CF-L) 10(CF-R) |
| 4-4-2 | 5 | 1 \| 3(LB) 6(CD-L) 5(CD-R) 2(RB) \| 11(LM) 8(CM-L) 4(CM-R) 7(RM) \| 9(CF-L) 10(CF-R) |
| 3-4-3 | 2 | 1 \| 4(CD-L) 5(CD) 6(CD-R) \| 3(LM) 8(CM-L) 7(CM-R) 2(RM) \| 11(CF-L) 9(F) 10(CF-R) |
| 4-1-4-1 | 2 | 1 \| 3(LB) 6(CD-L) 5(CD-R) 2(RB) \| 4(DM) \| 11(LM) 10(CM-L) 8(CM-R) 7(RM) \| 9(F) |
| 4-3-2-1 | 1 | 1 \| 3(LB) 6(CD-L) 5(CD-R) 2(RB) \| 7(CM-L) 4(CM) 8(CM-R) \| 11(CF-L) 10(CF-R) \| 9(F) |
| 4-4-1-1 | 1 | 1 \| 3(LB) 6(CD-L) 5(CD-R) 2(RB) \| 11(LM) 8(CM-L) 4(CM-R) 7(RM) \| 10(RCF) \| 9(F) |
| 4-1-3-2 | 1 | 1 \| 3(LB) 6(CD-L) 5(CD-R) 2(RB) \| 4(SW) \| 11(LM) 8(CM) 7(RM) \| 10(CF-L) 9(CF-R) |
| 3-1-4-2 | 1 | 1 \| 6(CD-L) 4(CD) 5(CD-R) \| 8(SW) \| 3(LM) 11(CM-L) 7(CM-R) 2(RM) \| 10(CF-L) 9(CF-R) |
| 3-4-1-2 | 0 (1 women's) | 1 \| 4(CD-L) 5(CD) 6(CD-R) \| 3(LM) 8(CM-L) 7(CM-R) 2(RM) \| 9(AM) \| 11(CF-L) 10(CF-R) |

All five formations the ticket names are there, each on at least five sides. The formations seen once rest on one side each. The 3-4-1-2 row comes from Watford's women during their match.

The 10 women's sides read during their matches (Hammarby, Sparta Prague, Malmö, Ajax, Liverpool, Aston Villa, Brighton, Watford, Juventus, Lyon, in 4-4-2, 4-2-3-1, 4-3-3, 3-4-2-1, 3-4-3, 4-3-2-1 and 3-4-1-2) had exactly the places and labels of this table, and the rule placed all of them.

Guess, not verified: the numbering looks like Opta's fixed "formation place" scheme, which ESPN's data source would pass through. If so, the set of formations is closed (about two dozen) and a table can cover all of them. Nothing in the responses names the data provider for lineups. The key events carry `source.description` `"SA.ENVOY"`.

### When the formation or the places are missing

Observed:

- **No side with players lacked `formation`.** That is 58 modern sides after full time, the 2015 match, and every women's side at every poll from the first moment its players were listed.
- **A side without players has no `formation` and no `roster` key at all.** Its `rosters` entry is only `{ homeAway, winner, team }`. This was the case for every summary fetched before lineups were out, and for three finished small national-team matches of the day (Vietnam v Chinese Taipei, India v Maldives, Bangladesh v Sri Lanka).
- **The 2015 match has no `formationPlace` key on any player** (reading it in JavaScript gives `undefined`; the sibling finding reported this as `null`). Its labels do not fit its formation: Inter's 4-3-1-2 has `LB CD-L CD-R RB`, then `M CM LM RM`, `AM` and one `CF-R`, which is four midfielders and one forward. The rule fails on it (a cut splits `LM` from `RM`). Atalanta's 4-3-3 in the same match happens to fit the rule.

Guess, not verified: with no `formation` the labels alone can still give rows (one row per depth class of the table above), and with no `formationPlace` and labels that do not add up to the formation, a plain list is safer than a pitch.

## Before kick-off and during the match

No men's match of a top-5 league, a European cup or a major national team was played that evening (an international break, with the Nations League starting the next day). All of this section comes from five women's matches: two Europa Cup matches (`uefa.w.europa`) that kicked off at 18:00, and the three matches [polled](#when-lineups-appear) from before their lineups were out.

### Before kick-off

Observed:

- **A lineup goes through up to four states.** Each poll of a side gave one of them:

  | State | `roster` | `formationPlace` of starters | Labels of starters |
  |---|---|---|---|
  | 1. Not out | key absent | | |
  | 2. Names | 11 starters and the bench, `formation` set | all `"0"` | all `SUB` (Aston Villa), or `G`/`D`/`M`/`F` (Brighton, Lyon) |
  | 3. Places | as before | `"1"` to `"11"` | `SUB` (Brighton, Lyon, Malmö), `G`/`D`/`M`/`F` (Liverpool, Watford, Juventus, Ajax), or full (Aston Villa, Hammarby, Sparta Prague) |
  | 4. Kicked off | as before | unchanged | full, as in the [table](#the-places-of-each-formation) |

- Lyon's labels went from `G`/`D`/`M`/`F` in state 2 to `SUB` in state 3. So a coarse label can turn into `SUB`, not only into a full one.
- **The places did not move at kick-off.** On all six polled sides every starter kept the `formationPlace` of state 3 in the first poll after kick-off.
- Before kick-off `subbedIn` is an object, `{ "didSub": false }`, on every player (1,326 player entries seen), and a boolean once the match is under way. `p.subbedIn === true` reads both correctly. `subbedOut` was a boolean throughout.
- Before kick-off no player had `stats` or `plays`.

So the table by `formationPlace` is the only way to place most pre-match lineups, and the labels rule only works once the match has started.

### During the match

Observed:

- **The formation and the places change during a match.** Aston Villa's women were `3-4-2-1` at 8 minutes and `4-4-2` at 12 minutes. Eight of the 10 outfield starters got a new `formationPlace`, and every starter got the label that goes with her place in the new formation (Jean-François `5:CD` became `8:CM-L`, Taylor `7:CM-R` became `5:CD-R`, Mullett `9:F` became `9:CF-L`, and so on). Sparta Prague were `4-4-2` at 4 minutes and `4-3-2-1` at 60 minutes, again with new places for 7 of the 10 outfield starters. In both cases the new places and labels fit the table and the rule.
- Whether these were real changes of shape or ESPN correcting a wrong starting lineup, the response does not say. Some moves are odd for a change of shape (Sparta's `CD-L` became `CF-L`).
- **Substitutions show up during the match** as they do at full time: at 58 minutes Malmö and Ajax had `subbedOut: true`, `subbedOutFor`, `subbedInFor` and the `plays` minute (`45'`) on the players concerned. The players who came on had `formationPlace` `"0"` and `SUB`.
- `stats` were filled during the match for Malmö v Ajax, Liverpool v Aston Villa, Brighton v Watford and Juventus v Lyon, but stayed empty on all players of Hammarby v Sparta Prague at 60 minutes. That match also had no key events of type `substitution` at 60 minutes.

## Substitutions

Observed:

- A starter who went off has `subbedOut: true` and `subbedOutFor` with the `jersey` and the `athlete` (`id`, `displayName`, `links`) of the player who came on. His `plays` has an entry with `substitution: true` and `clock.displayValue` (`"87'"`).
- The player who came on has `subbedIn: true`, `subbedInFor` naming the player he replaced, and the same `plays` entry with the same minute.
- A player who came on and went off again has both, as in Rayo Vallecano: Vertrouwd came on for Pedrosa (`LB`, place 3) at 79', then went off for Alemão at 89'. Following `subbedOutFor` from the starter gives the chain.
- The `keyEvents` entry of type `substitution` says the same thing in another form: `participants[0]` is the player who came on, `participants[1]` the one who went off, with the minute in `clock.displayValue`. This is what `parseSummary` already reads today.
- **Nothing says where the player who came on played.** He keeps `formationPlace` `"0"` and the label `SUB`, at full time and during the match. The summary keeps one `formation` per side and no history of it: when the formation changes during the match (see [above](#during-the-match)), the old one is gone.

Guesses, not verified:

- Putting the player who came on in the slot of the one he replaced is right most of the time and wrong after a tactical change. Two examples from the data: Inter took off the forward Thuram (`CF-L`) for the defender Pavard at 88', and Rayo's left-back slot ended with Alemão, a forward.
- Since the formation changes during the match, the `formation` and places of a finished match are probably the last shape, not the starting one. No finished men's match was seen to differ from its start, because none was watched from the start.

## Other data per player

Observed on the 1,244 players of the 29 modern summaries:

| Wanted | Where | Observed |
|---|---|---|
| Goals | `stats[]` with `name` `totalGoals`; `plays[]` with `didScore: true` | Own goals are not counted in `totalGoals`, they are in `ownGoals`. An own goal also has a `plays` entry with `didScore: true` and `ownGoal: true`, on the roster of the team that conceded. Sum of `totalGoals` plus the other side's `ownGoals` matched the score on every side. |
| Assists | `stats` `goalAssists`; `plays[]` `didAssist: true` | |
| Yellow card | `stats` `yellowCards`; `plays[]` `yellowCard: true` with the minute | |
| Red card | `stats` `redCards`; `plays[]` `redCard: true` with the minute | After a second yellow, `yellowCards` is `0` and `redCards` is `1`, while `plays` has both the yellow and the red with their minutes (Wharton: `58'` yellow, `77'` red). A straight red has only the red. |
| Penalty | `plays[]` `penaltyKick` | |
| Substitution minute | `plays[]` `substitution: true` | See above. |
| Other stats | `stats` | `appearances`, `subIns`, `foulsCommitted`, `foulsSuffered`, `offsides`, `totalShots`, `shotsOnTarget`, and for goalkeepers `saves`, `shotsFaced`, `goalsConceded`. Each has `value` (number) and `displayValue`. |
| Headshot | `athlete.headshot.href` | **On 83 of 1,244 players (7%), 51 of 638 starters (8%).** Spread over all leagues: 6 of 96 in Serie A, 18 of 200 in the Premier League, 15 of 46 in the Champions League match. The one fetched was a 187 KB PNG. Building the URL from the athlete id for a player without `headshot` gave HTTP 404. |
| Shirt image | `athlete.jerseyImages[]` | On every player, two URLs (`darkMode=false` and `true`) at `stitcher.espn.com`, per match and player. The one fetched was a 244 KB PNG, 1440×1440. |
| Captain | none | No field. The word appears only in the text of news and the match recap. |
| Short name | `athlete.shortName` | `"F. Dimarco"`, on every player. Useful on a small pitch. |

## When lineups appear

Observed by polling `all/summary?event={id}` every 5 minutes from 17:57, for three women's matches. "Before" is counted back from the kick-off in the response. Each range runs from the last poll without the change to the first poll with it.

| Side | Kick-off | Names (state 2) | Places (state 3) | Full labels (state 4) |
|---|---|---|---|---|
| Aston Villa | 19:00 | 47 to 52 min before | 42 to 47 min before | with the places, 42 to 47 min before |
| Liverpool | 19:00 | 42 to 47 min before, with places | same poll | at kick-off (first poll at 2') |
| Brighton | 19:45 | 48 to 53 min before | 43 to 48 min before | at kick-off (first poll at 1') |
| Watford | 19:45 | 43 to 48 min before, with places | same poll | at kick-off |
| Lyon | 20:00 | 58 to 63 min before | 53 to 58 min before | at kick-off (first poll at 1') |
| Juventus | 20:00 | 53 to 58 min before, with places | same poll | at kick-off |

- **The two teams of a match were not listed at the same time.** In each of the three matches one side appeared one poll (5 minutes) before the other.
- Before its lineup, a summary of the same match had `rosters` entries with no `roster` key (state 1), at every poll back to 17:57.
- The two Europa Cup matches already had places 3 minutes before kick-off, at the first poll. When their lineups first appeared was not seen.

Guess, not verified: this fits the usual rule that teams hand in their lineups about an hour before kick-off, and suggests ESPN's feed carries them within minutes. Men's top-flight matches were not observed. ESPN documents nothing about this.

## What the recorded fixtures hold

`convex/espnFixtures/summary-401874810.json` (Napoli v Lazio, 3-4-2-1 v 4-3-3) is the only summary among the fixtures. It is trimmed to 17 KB. For each roster it keeps `homeAway`, `team`, `formation` and `roster`, and for each player only `starter`, `jersey`, `athlete.displayName` and `position.abbreviation`.

- The labels it keeps are the same as in today's live response for that match.
- **It has no `formationPlace`,** no `subbedIn`/`subbedOut`/`subbedInFor`/`subbedOutFor`, no `stats`, no `plays`, no `athlete.id`, `shortName`, `headshot` or `jerseyImages`.
- It has no roster without players, so the case that makes `parseSummary` throw is not covered.
- No scoreboard or team fixture has lineups.

So the labels rule could be tested on the fixture as it is, but the `formationPlace` table, substitutions and per-player data need the fixture refreshed from a live response (trimmed the same way).

## Side finding: `parseSummary` and a summary without lineups

Observed, by running `parseSummary` from `convex/espn.ts`, unchanged, on the saved responses:

- On a summary fetched before lineups are out, and on the three finished small national-team matches, it throws `ESPN: rosters[].roster missing`. The code reads `arr(r.roster, "rosters[].roster")` and expects the key; the `players.length === 0` check after it never runs, because ESPN leaves the key out instead of sending an empty list.
- On the pre-match women's lineups and on all finished modern summaries it works.
- In `convex/footballMatches.ts` the error is caught and logged, and the previous details stay. So today a match gets no details at all (no events, no stats) until its lineups are out, and never if it has none. This matters to this map only because the pitch view will show what is there before kick-off.

## Not verified

- **A men's match before kick-off or in progress.** Everything about the time before kick-off and during a match comes from five women's matches on one evening. How long before kick-off men's top-flight lineups appear, whether their labels are also `SUB` or `G`/`D`/`M`/`F` until kick-off, and whether their formation changes during a match were not seen.
- **Why a formation changed during a match** (a real change of shape, or ESPN correcting the starting lineup), and whether a finished summary keeps the starting shape or the last one.
- **Formations not seen:** 5-3-2, 5-4-1, 4-1-2-1-2 (diamond), 4-2-2-2, 4-5-1 and any other. The table covers only the 12 formations above. Whether their numbering follows the same scheme is a guess.
- **Formations seen on only one side** (4-4-1-1, 4-1-3-2, 3-1-4-2, 3-4-1-2): their table rows rest on that one side. 4-3-2-1 was seen once after full time and once during a women's match.
- **A lineup that ESPN lists without places after kick-off.** Every side seen had places from kick-off on. A lower-tier match where the places stay `"0"` was not found.
- **Where a player who came on actually played.** ESPN does not say; see [Substitutions](#substitutions).
- **Summaries between 2015 and 2025.** Only 2015 (no places) and 2025-26 or later (with places) were read, so when `formationPlace` started is unknown.
- **Leagues outside the competitions read,** and lower divisions.
- **Headshots of the players without `athlete.headshot`** through some other path. Only the id-based URL was tried.
- **Rate limits and Convex's egress IPs.** All requests came from a home connection.

## Resolution comment

Ready to post on #126:

````markdown
## Resolution

Checked on real keyless responses on 2026-11-11 (134 requests): 29 finished summaries (Serie A, Premier League, LaLiga, Bundesliga, Ligue 1, Champions League, Europa League, the 2026 World Cup final and a World Cup play-off, 58 sides), the 2015 Inter v Atalanta, and five women's matches polled every 5 minutes from before their lineups were out until after kick-off. Paths are under `/site/v2/sports/soccer/`.

**Can the lineups be drawn on a pitch from ESPN alone, and what must the provider module read?**
Yes. Per side: `rosters[].formation`. Per starter: `formationPlace` (`"1"` to `"11"`) and, as a fallback, `position.abbreviation`. Per player: `athlete.id`, `athlete.shortName`, `subbedIn` / `subbedOut` / `subbedInFor` / `subbedOutFor`, `stats` and `plays`, and `athlete.headshot` where there is one. Today `parseSummary` keeps only the formation, the name and the jersey.

**Which fields place a starter, and what is the rule into rows?**
`formationPlace` is a slot number whose meaning depends on the formation, not a row order (in a 3-5-2, places 2 and 3 are the wing-backs and 4 to 6 the centre-backs). For one formation, a place always had the same label on every side seen (`4-2-3-1`: `4:LM 8:RM`, `7:AM-R 10:AM 11:AM-L`, `9:F`). The rule, which held on all 58 sides and on the 10 women's sides during their matches:
1. Place `"1"` (`G`) is the goalkeeper.
2. Sort the other 10 by the depth of their label: back line (`CD*`, `LB`, `RB`), then `DM`/`SW`, then `CM*`/`LM`/`RM`/`M`, then `AM*`, then `CF-L`/`CF-R`/`RCF`, then `F`/`LF`/`RF`.
3. Cut that list into rows of the sizes in the formation string, from the back.
4. Order each row left to right: `LB`/`LM`/`LF`, then `*-L`, then the centre, then `*-R`/`RCF`, then `RB`/`RM`/`RF`. Left is the team's own left.

Because labels are often missing before kick-off (next answer), the module should store the result as a fixed table, formation + `formationPlace` to row and order, and use the label rule only for a formation not in the table. The table for the 12 formations seen is in the file.

**Does it hold for the common formations, and what if the formation is missing?**
It held on every side of 4-3-3 (8), 4-2-3-1 (25), 3-5-2 (5), 3-4-2-1 (7) and 4-4-2 (5), and on 3-4-3, 4-1-4-1, 4-3-2-1, 4-4-1-1, 4-1-3-2, 3-1-4-2 and 3-4-1-2. No side with players lacked `formation`. A side without players has no `formation` and no `roster` key at all. The 2015 summary has no `formationPlace` and labels that do not fit its formation, so the rule fails on it: show a list there.

**Before kick-off and during the match** (women's matches only):
- Before kick-off, 7 of 10 sides had places `1` to `11` but labels all `SUB` or only `G`/`D`/`M`/`F`. Full labels came at kick-off. The places did not move at kick-off.
- During a match the formation and places can change: Aston Villa went from 3-4-2-1 to 4-4-2 at 12', with new places for 8 of 10 outfield players. The pitch must follow the latest summary.
- Before kick-off `subbedIn` is `{ "didSub": false }`, not a boolean.

**What does the roster say about a substitution?**
The starter who went off has `subbedOut: true` and `subbedOutFor` (jersey, athlete id and name of the player who came on). That player has `subbedIn: true` and `subbedInFor`. Both have a `plays` entry with `substitution: true` and the minute. A player who came on and went off has both, so chains can be followed. This also shows up during the match. **The player who came on gets no place:** `formationPlace` `"0"` and label `SUB`. Putting him in the slot of the player he replaced is a guess, and wrong after a tactical change (Inter swapped the forward Thuram for the defender Pavard).

**What else per player?**
- Goals (`totalGoals`, own goals separate in `ownGoals`), assists, yellow and red cards, saves and more, in `stats`, with minutes in `plays` (`didScore`, `yellowCard`, `redCard`, `ownGoal`, `penaltyKick`). After a second yellow the stats say yellow 0, red 1, while `plays` has both minutes.
- A headshot (`athlete.headshot.href`) on only 83 of 1,244 players (7%). Guessing the URL from the id gave 404 for the one player tried.
- A shirt image on every player (`athlete.jerseyImages`, 244 KB PNG), and `athlete.shortName` (`"F. Dimarco"`).
- **No captain field.**

**How long before kick-off?**
Polling three women's matches every 5 minutes: each side's lineup appeared 42 to 63 minutes before kick-off. The two teams of a match came 5 minutes apart. On half the sides the names came first with all places `"0"`, and the places one poll later. Before that, `rosters` entries have no `roster` key. ESPN documents nothing about it.

**How much is in the recorded fixtures?**
Only `summary-401874810.json` has lineups. It keeps `formation`, `starter`, `jersey`, `athlete.displayName` and `position.abbreviation`, and nothing else: no `formationPlace`, no substitution fields, no stats, plays, ids, short names or images. The label rule places both of its sides correctly. The rest needs the fixture refreshed from a live response.

**Side finding:** `parseSummary` throws `ESPN: rosters[].roster missing` on any summary whose lineups are not out yet, because ESPN leaves out the `roster` key instead of sending an empty list. So today a match gets no stored details at all until its lineups are out, and never if it has none (seen on three small national-team matches).

**Not verified:** any men's match before kick-off or in progress, why a formation changes during a match, whether a finished summary keeps the starting shape or the last one, formations not seen (5-3-2, 5-4-1, the diamond, 4-2-2-2, 4-5-1), summaries between 2015 and 2025, lower divisions, rate limits and Convex's egress IPs.

Full findings, with the table of places per formation, a JSON sample and the list of every request: https://github.com/NoahGiesel/tauri-convex-chat-app/blob/research/espn-pitch-positions/docs/research/espn-pitch-positions.md
````
