# Is there a free data source better than Highlightly's free plan?

Research for issue #106 on the map #99 "Pin football teams with a live Match bar in direct chats".
It builds on [`free-football-api.md`](https://github.com/NoahGiesel/tauri-convex-chat-app/blob/research/free-football-api/docs/research/free-football-api.md)
(issue #100) and the real-key check in issue #105. Throwaway branch, never merged.
Researched on 2026-11-08 between 14:48 and 15:21 UTC, a Sunday with live top-5 matches.

## Answer

**Switch to ESPN's public JSON (`site.api.espn.com`) as the main source, and keep Highlightly
free as the fallback behind the same adapter.** On every technical point ESPN beats Highlightly
free. It has two real risks: it is undocumented, and Disney's terms forbid automated access.
The driving dev has to accept those risks on purpose. If the dev does not accept them, keep
Highlightly.

Why ESPN wins on the map's constraints (all checked with real requests from this machine):

- **Current season and every target competition:** `ita.1`, `eng.1`, `esp.1`, `ger.1`, `fra.1`,
  `uefa.champions`, `uefa.europa`, `uefa.europa.conf` all report "2026-27" and today's or this
  week's matches. `fifa.world` holds the 2026 World Cup (final ARG-ESP, 2026-07-19). `uefa.euro`
  holds Euro 2024, the latest edition.
- **No key and no published quota.** One scoreboard call per competition per minute is about
  120 calls per 2-hour window. That carries **1-minute polling for every pinned match every
  day**, which Highlightly free (100 calls a day) cannot do. 40 back-to-back requests took 3.6 s
  and all returned 200. 440 more calls over 30 minutes of live polling also all returned 200.
- **Live delay:** the clock matched wall time (Köln-Leverkusen, kick-off 14:30 UTC, showed 24' at
  14:54 UTC). Three live goals reached ESPN 21 s, 42 s and 1 min 45 s after FotMob and LiveScore
  showed them. With a 1-minute poll, that is about 1-3 minutes behind the fastest feed, at the
  edge of the map's target (see [Live freshness](#live-freshness-test)). The CDN caches the
  scoreboard for 1 second and the match summary for 3 seconds.
- **Detail panel in one call:** `/summary?event=<id>` returns key events (goals with scorer and
  assist, own goals, cards, substitutions, all with minute), both lineups with formation,
  starters and bench, and 28 team stats rows per side. Those include **Possession, SHOTS (total),
  ON GOAL, Corner Kicks, Fouls and Offsides**, the exact rows the map asks for. They are
  present during play, not only after.
- **Team search that works:** `common/v3/search` matches part of a name and finds the right club
  for "inter", "milan", "bayern", "psg", "atletico" and "italy". Highlightly's search finds
  nothing for four of those. Per-competition team lists (`/{league}/teams`) give a ready team
  index too.
- **Next match in one call:** `/all/teams/{id}` returns `nextEvent` across all competitions
  (Inter: Como-Inter today, then Atalanta, Stuttgart in the Champions League, Genoa).

Why it is still a risk:

- **Terms:** ESPN pages link to the Disney Terms of Use. They give a "personal, noncommercial
  use only" license and forbid accessing or extracting the products "using a robot, spider,
  script, or other automated means". A Convex poller is a script. A small private chat app is
  non-commercial, but it is still automated access. Highlightly is the only candidate whose terms
  allow this use.
- **Undocumented:** ESPN publishes no docs, no version promise and no rate limit. Field names can
  change without notice.
- **Cloud IP untested:** this machine is a residential IP in Italy. Convex sends every outbound
  `fetch` from a few **egress IPs shared by all Convex deployments in the region**. A block from
  ESPN's CDN (Akamai) would hit those shared IPs, and so this app, too. No report of ESPN
  blocking cloud IPs was found, and ESPN's own API hosts run on AWS. But only a real call from a
  Convex action can settle it.

So the adapter should fall back to Highlightly when ESPN fails or its shape changes. Highlightly's
100 calls a day are then the floor, not the ceiling.

**Ruled out:**

- **Google match results:** even from a residential IP, `google.com/search` returns only a
  JavaScript shell with an "enablejs" redirect, and no score. Google has required JavaScript for
  Search since January 2025 to stop scrapers. A headless browser would be needed, which a Convex
  action does not have. Google's terms forbid "using automated means to access content". There is
  no structured data to rely on.
- **SofaScore:** every API call returned **403 Forbidden** from this residential IP with a plain
  HTTP client. Others report the same 403 from servers. Not usable without bypassing a block.
- **FotMob:** the JSON works today (`/api/data/matches`, `/api/data/matchDetails`,
  `/api/data/search/suggest`) and is as rich as ESPN. But its terms forbid "automatic services
  (robots, spiders, etc.)" and "systematic, regular, or bulk retrieval", robots.txt disallows
  `/api/*`, and FotMob has added anti-scraping headers before and asked a library to remove its
  FotMob scraper. More likely than ESPN to break or be blocked on purpose.
- **LiveScore** (`prod-public-api.livescore.com`): scores work, but robots.txt disallows `/api/`,
  and it adds nothing over ESPN.
- **OpenLigaDB:** a free, official, keyless community API under ODbL. Only the Bundesliga is
  kept live. The community Premier League and LaLiga leagues were last updated days ago, there is
  no Serie A or Ligue 1, and there are no lineups or stats.
- **UEFA's own feed** (`match.uefa.com`): unofficial, but rich (lineups, events, stats). It covers
  UEFA competitions only, not the domestic leagues or the World Cup.
- **New "free" commercial APIs** (SportAPI, BigBalls Sports Data, GOAL API): 1,000 calls a day on
  paper, but unknown operators, untested without a key, and each has a catch (SportAPI lineups only
  after the final whistle, BigBalls "full minute-by-minute stream is Pro", GOAL API publishes no
  free limits).

## How to read this

- **[tested]**: a real request from this machine on 2026-11-08. **This machine is a
  residential IP in Italy, not a cloud IP.** A Convex action may see different results.
- **[read]**: read on the owner's own page, linked.
- **[third-party]**: an independent report, not the owner.
- **[inferred]**: follows from the above, not observed.

No API key was used or created. No secret was changed. Terms statements are a reading of the
text, not legal advice. All probe scripts sent a normal browser User-Agent and no other spoofed
headers. No block was bypassed.

## Real request results

### ESPN (`site.api.espn.com/apis/site/v2/sports/soccer/...`)

| Request | Result [tested] |
|---|---|
| `/ita.1/scoreboard` at 14:48 UTC | 200, 64 KB, `Cache-Control: max-age=1`, `Access-Control-Allow-Origin: *`. Season "2026-27 Italian Serie A". 5 matches: Napoli 1-1 Lazio `STATUS_FULL_TIME`, Genoa 0-2 AC Milan `STATUS_FIRST_HALF` 45', Monza-Atalanta live, Inter-Como and Fiorentina-Juventus `STATUS_SCHEDULED` |
| `/{eng.1,esp.1,ger.1,fra.1}/scoreboard` | 200 each, all "2026-27", live matches with `STATUS_FIRST_HALF` / `STATUS_HALFTIME` / `STATUS_SECOND_HALF` |
| `/uefa.champions/scoreboard` | 200, "2026-27 UEFA Champions League", 9 matches of 2026-11-04 (e.g. AEK-Real Madrid FT) |
| `/uefa.europa/scoreboard`, `/uefa.europa.conf/scoreboard` | 200, "2026-27", 17 and 18 matches of 2026-11-05 |
| `/fifa.world/scoreboard` | 200, "2026 FIFA World Cup", final Spain-Argentina 2026-07-19 `STATUS_FINAL_AET` |
| `/uefa.euro/scoreboard` | 200, "2024 European Championship", final Spain-England 2024-07-14 |
| `/uefa.champions/scoreboard?dates=20261125` | 200, the 9 matches of that night. A date range (`20261124-20261126`) returned 400 |
| `/ita.1/summary?event=401874810` (Napoli-Lazio, finished) | 200, 432 KB, `max-age=3`. 27 `keyEvents`: goal 28' Frattesi (assist Noslin), own goal 48' Pedraza, yellow cards, substitutions ("Diogo Leite replaces Josip Sutalo"), half-time, end of regular time. `rosters`: Napoli 3-4-2-1, 11 starters + 11 bench, Lazio 4-3-3, 11 + 15, each with position and `formationPlace`. `boxscore.teams[].statistics`: 28 rows per side, e.g. Fouls 12/11, Yellow Cards 3/1, Offsides 2/1, Corner Kicks 6/6, Possession 49/51, SHOTS 15/15, ON GOAL 6/6, Blocked Shots 4/4, Saves 5/6. Also 114 commentary lines |
| `/ger.1/summary` and `/fra.1/summary` during play (14:54 UTC) | Köln-Leverkusen at 24': both rosters (3-5-2, 4-2-3-1), 28 stat rows, possession 39/61. Rennes-Lille at half-time: goals at 24' and 31' in `keyEvents` |
| `/ita.1/teams`, `/uefa.champions/teams`, `/fifa.world/teams` | 200, 20, 36 and 48 teams, each with `id`, `displayName`, `shortDisplayName`, `abbreviation` (e.g. 103 "AC Milan" / "Milan" / MIL) |
| `site.api.espn.com/apis/common/v3/search?query=<q>&type=team&sport=soccer` | "inter": Inter Miami, **Internazionale (ita.1, 110)**, Internacional. "milan": **AC Milan (103)**, Internazionale. "bayern": **Bayern München (ger.1, 132)**. "psg": **Paris Saint-Germain (fra.1, 160)**. "atletico": **Atlético de Madrid (esp.1, 1068)**. "italy": **Italy (162)**, then youth and women's teams. Results carry the league slug, so women's and youth teams can be filtered out |
| `/all/teams/110` | 200, Internazionale with logo and `nextEvent` = Como-Inter 2026-11-08 17:00 UTC |
| `/all/teams/110/schedule?fixture=true` | 200, 34 upcoming matches across competitions: Como-Inter, Atalanta-Inter, Inter-Stuttgart (Champions League, 2026-11-25), Inter-Genoa |
| `/all/teams/162/schedule?fixture=true` (Italy) | 200, Italy-France 2026-11-12 and Belgium-Italy 2026-11-15 |
| 40 back-to-back scoreboard calls with a cache-busting query | 40 × 200 in 3.6 s. No rate-limit headers in any response |
| `site.api.espn.com/robots.txt` | Akamai "Access Denied" page. `www.espn.com/robots.txt` does not list the API host |

### FotMob (`www.fotmob.com/api/data/...`)

| Request | Result [tested] |
|---|---|
| `/api/matches?date=…`, `/api/leagues?id=…` (old paths) | 404 from CloudFront |
| `/api/data/matches?date=20261108` | 200, 286 KB, `max-age=10`. All leagues of the day; each match has scores, `status.liveTime.long` ("49:05") and red cards. 108 matches live at 14:50 UTC |
| `/api/data/matchDetails?matchId=5795506` (Brighton-Brentford, live) | 200, 217 KB. Events (goals, cards, VAR, added time), lineups (4-2-3-1 both, 11 + 9), stats: possession 75/25, xG, total shots 10/3, shots on target 4/0, corners 3/1, and more |
| Same for 2023 and 2024 matches (not in cache) | 200 from origin, with **no** `x-mas` header sent |
| `/api/data/search/suggest?term=inter` | 200, Inter (8636, Serie A) first, then Inter Miami |
| `www.fotmob.com/robots.txt` | `Disallow: /api/*` for all agents, `Allow: /api/*` only for Googlebot, Bingbot, Qwantbot, AmazonAdBot |

### SofaScore

| Request | Result [tested] |
|---|---|
| `api.sofascore.com/api/v1/sport/football/events/live` | **403** `{"error": {"code": 403, "reason": "Forbidden"}}`, `Server: Varnish` |
| `www.sofascore.com/api/v1/sport/football/events/live` | 403, same body |
| `api.sofascore.com/api/v1/sport/football/scheduled-events/2026-11-08` | 403, same body |

### Google Search

| Request | Result [tested] |
|---|---|
| `www.google.com/search?q=inter+como&hl=en` | 200, 93 KB, but the body is a JavaScript shell. The `<noscript>` part redirects to `/httpservice/retry/enablejs`. The words "Como" and any score are absent. This was from a residential IP, the friendliest case |

### OpenLigaDB (`api.openligadb.de`)

| Request | Result [tested] |
|---|---|
| `/getmatchdata/bl1` | 200, matchday 9 of "1. Fußball-Bundesliga 2026/2027", with goals (`matchMinute`, `goalGetterName`, `isPenalty`, `isOwnGoal`) |
| `/getmatchdata/{shortcut}/2026` | `bl1` last update **today** 15:37 (local time). `pl` (Premier League) last update 2026-11-05, `la1` 2026-10-30, `ucl` 2026-11-04, `uel2026` 2026-11-05, `uecl2026` 2026-11-06, `wm26` (104 World Cup matches) 2026-07-20. No Serie A or Ligue 1 league for 2026/27 |
| `/getavailableleagues` | Many user-made duplicates (e.g. "WM 2026", "WM 2026 USA", "FIFA World Cup 2026", "WC2026", "BLClaude") |

### Others

| Request | Result [tested] |
|---|---|
| `prod-public-api.livescore.com/v1/api/app/date/soccer/20261108/1?MD=1` | 200, 396 KB, `max-age=10`. Stages per league with team names, scores and minute (Brighton 2-0 Brentford 45+4') |
| `match.uefa.com/v5/matches?competitionId=1&seasonYear=2027&fromDate=2026-11-04&toDate=2026-11-05` | 200, 9 Champions League matches (Fenerbahçe 3-2 Liverpool). `/v5/matches/{id}/lineups` and `matchstats.uefa.com/v1/team-statistics/{id}` both 200 |

### Live freshness test

Two runs, 14:50-15:02 and 15:02-15:21 UTC. Every 20 seconds the script fetched the five top-league
ESPN scoreboards, the FotMob day list and the LiveScore day list, and logged the moment each
source first showed a new score [tested]. 88 rounds made **616 requests (440 to ESPN), and every
one returned 200**.

No goal fell in the first 11 minutes. Three goals fell in the second run:

| Goal | FotMob | LiveScore | ESPN | ESPN behind the first source |
|---|---|---|---|---|
| Ipswich 0-2 Bournemouth | 15:03:23 (45:59) | 15:03:23 (46') | 15:05:08 (48') | 1 min 45 s |
| Monza 0-1 Atalanta | 15:08:58 (49:22) | 15:09:20 (50') | 15:09:40 (50') | 42 s |
| Crystal Palace 0-2 Liverpool | 15:15:14 (54:01) | 15:15:14 (54') | 15:15:35 (55') | 21 s |

The poll step was 20 s, so each time is accurate to about 20 s. No source shows the true moment of
the goal, so these are lags behind the fastest feed, not behind the pitch.

**Reading [inferred]:** ESPN was the slowest of the three and trailed the fastest feed by 20 s to
under 2 minutes. With a 1-minute poll on top, a goal reaches the Match bar about 1-3 minutes after
FotMob shows it. That is at the edge of the map's 1-2 minute target, about the same as
Highlightly free on a good day (refresh "once a minute", polled every 2 minutes), and without its
quota. The ESPN clock itself stayed in step with the other two (48' against 46' at most, mostly
the same minute).

## Candidates against the map's constraints

| Constraint | Highlightly free | ESPN | FotMob | SofaScore | Google | OpenLigaDB | football-data.org free |
|---|---|---|---|---|---|---|---|
| Current season | Yes (#105) | Yes [tested] | Yes [tested] | Unknown (403) | n/a | Yes | Yes |
| Top 5 leagues | Yes | Yes | Yes | Unknown | n/a | Bundesliga live only | Yes |
| UCL, UEL, UECL | Yes | Yes | Yes | Unknown | n/a | Community, lags days | UCL only |
| World Cup, Euros | Yes | Yes (Euro 2024 is the latest) | Yes | Unknown | n/a | WC 2026 (community) | Yes |
| Live delay 1-2 min | Yes, but quota limits it to one window a day | About 1-3 min with a 1-min poll (goals 20 s to 1 min 45 s behind FotMob) | Fastest seen, cache 10 s | Unknown | n/a | Bundesliga only, community-typed | No (delayed) |
| Events | Yes | Yes | Yes | Unknown | No | Goals only | No |
| Lineups | Yes | Yes, with formation | Yes, with formation | Unknown | No | No | No |
| Stats (possession, shots, on target, corners, fouls, offsides) | Yes, total shots derived | Yes, all rows incl. total shots | Yes | Unknown | No | No | No |
| Team search | Exact full name only | Partial match, right club for all test names | Partial match | Unknown | n/a | No | No |
| Polling per day | 100 calls | No published limit | No published limit | n/a | n/a | No published limit | 10 calls/min, no daily cap |
| Break or block risk | Low (official API) | Medium (undocumented, cloud IP untested) | High (robots.txt bans `/api`, anti-scraping history) | Already blocked | Already blocked | Low, but data quality depends on volunteers | Low |
| Terms | Allows use in own apps | Forbids automated access | Forbids automated and systematic retrieval | Not found | Forbids automated access | ODbL, free | Allows, with attribution |

## Candidates in detail

### ESPN

- **What it is:** the JSON behind espn.com, no key needed. No official documentation exists. The
  community maps the endpoints and warns there is "no guarantee of long-term stability or
  support" and to "be prepared for potential changes without notice" [third-party:
  [Zuplo guide](https://dev.to/zuplo/unlocking-espns-hidden-api-a-developers-guide-1pp7),
  [nntrn gist](https://gist.github.com/nntrn/ee26cb2a0716de0947a0a4e9a157bc1c)]. Hobby projects
  such as the MagicMirror `MMM-MyScoreboard` module have used it for years [third-party:
  [MagicMirror forum](https://forum.magicmirror.builders/topic/4297/mmm-myscoreboard/236?page=10)].
- **Endpoints the feature would need** [tested]:
  - Match bar: `GET /apis/site/v2/sports/soccer/{league}/scoreboard` (today), or `?dates=YYYYMMDD`.
    One call per competition carries all its matches, with `status.type.name`, `displayClock`
    and both scores.
  - Detail panel: `GET /apis/site/v2/sports/soccer/{league}/summary?event={id}` (events, lineups
    and stats in one call).
  - `/calcio` picker: `GET /apis/common/v3/search?query=…&type=team&sport=soccer`, or a local index
    built from `/{league}/teams` for the 10 competitions.
  - Next match: `GET /apis/site/v2/sports/soccer/all/teams/{id}` (`nextEvent`).
- **League slugs:** `ita.1`, `eng.1`, `esp.1`, `ger.1`, `fra.1`, `uefa.champions`,
  `uefa.europa`, `uefa.europa.conf`, `fifa.world`, `uefa.euro` [tested].
- **Terms:** espn.com links to the Disney Terms of Use [tested: the espn.com footer links to
  `disneytermsofuse.com`]. They name ESPN among the Disney products, license them for "your
  personal, noncommercial use only", and forbid users to "access, monitor, copy or extract the
  Disney Products using a robot, spider, script, or other automated means" [read:
  [Disney Terms of Use](https://disneytermsofuse.com/english/)]. They do not mention APIs.
- **Blocking from cloud IPs:** no report of ESPN blocking AWS or other cloud IPs on this API was
  found [third-party: search results]. A hostname tracker places ESPN's API hosts on AWS
  [third-party: [netify](https://www.netify.ai/resources/hostnames/site.web.api.espn.com)]. The
  `robots.txt` request got an Akamai "Access Denied" page, which shows a bot-filtering CDN sits
  in front [tested].

### FotMob

- Works today without any special header, and the data is as rich as ESPN's, plus xG [tested].
- Terms (version of 2026-10-22): "Use of the data … for any purpose, including but not limited to
  scraping, reproduction, redistribution, or commercial purposes, without the express written
  consent of FotMob is strictly prohibited", and "The use of automatic services (robots, spiders,
  etc.), as well as other methods for systematic, regular, or bulk retrieval of data, is
  forbidden." [read: [fotmob.com/tos.txt](https://www.fotmob.com/tos.txt)]
- `robots.txt` disallows `/api/*` for everyone except named search engines [tested:
  [robots.txt](https://www.fotmob.com/robots.txt)].
- History: FotMob has used per-request signing headers (`x-mas`, `X-Fm-Req`) against scrapers
  [third-party: [viktornilsson](https://viktornilsson.github.io/security/2024/11/01/fotmob-auth.html),
  [jaschrs/laliga-api](https://github.com/jaschrs/laliga-api)]. The `soccerdata` library removed
  its FotMob scraper at FotMob's request [third-party:
  [soccerdata releases](https://github.com/probberechts/soccerdata/releases)].

### SofaScore

- 403 on every endpoint from a residential IP with a plain client [tested]. Users report the same
  403 from servers while the same code works at home [third-party:
  [PythonAnywhere forum](https://pythonanywhere.com/forums/topic/35429)]. Getting through would
  mean faking a browser, which is bypassing a block. Not pursued.

### Google match results

- A plain fetch gets a JavaScript-only page [tested]. Google has required JavaScript for Search
  since 2025-01-15, aimed at bots and scrapers [third-party:
  [SerpApi](https://serpapi.com/blog/google-now-requires-javascript/),
  [TechRadar](https://www.techradar.com/pro/surviving-googles-javascript-rendering-shift-one-month-later)].
  A cloud IP would face Google's "unusual traffic" checks on top of that, a stricter case than this
  residential test [inferred].
- Google's terms list "using automated means to access content from any of our services" as abuse,
  and name "scraping content that doesn't belong to you" as a reason to suspend access [read:
  [Google Terms of Service](https://policies.google.com/terms)].
- There is no stable structured data. The sports box is rendered by obfuscated scripts. It would
  need a headless browser, which Convex actions do not run [inferred].

### OpenLigaDB

- "Eine offene Datenbank zum Eingeben und Abrufen von Sport-Daten", a free community project. No
  authentication for reading, data under the Open Database License [read:
  [openligadb.de](https://www.openligadb.de/)].
- Only `bl1` is kept current on the day [tested]. Other leagues are typed in by volunteers, and
  late. Goals only: no lineups, cards or stats. Useful only for a Bundesliga-only feature.

### UEFA (`match.uefa.com`)

- Unofficial JSON behind uefa.com. Rich data for UEFA competitions [tested]. It has no domestic
  leagues, so it could only be a second source for the cups. ESPN already covers them.

### New commercial free tiers (not tested, no key)

- **SportAPI** (sportapi.ai): free 1,000 requests a day, 7,000 a month, "all endpoints and all
  leagues", live scores "every minute". Lineups are "added within about an hour after the final
  whistle", so there are no live lineups. No company is named [read: [sportapi.ai](https://sportapi.ai/)].
- **BigBalls Sports Data** (bigballsdata.com): free 1,000 a day (2,000 with GitHub), current
  season, events, lineups and stats endpoints marked Free. But "Free covers one selected sport at
  a time" and the "full minute-by-minute stream is Pro". The live delay on free is not stated
  [read: [football-api](https://bigballsdata.com/football-api), [pricing](https://bigballsdata.com/pricing)].
- **GOAL API** (goal-api.com): "a free plan that needs no credit card", with no numbers published
  [read: [goal-api.com](https://goal-api.com/)].
- **Sportmonks:** one page now says livescores, events, lineups and team statistics are
  "available on every plan including the free tier" [read:
  [livescore API](https://www.sportmonks.com/football-api/solutions/livescore-api/)], but the free
  plan page still lists only the Danish and Scottish leagues (#100). Nothing changes.

## Mixed setups

- **ESPN main, Highlightly fallback (recommended):** one adapter interface (`scoreboard`,
  `matchDetail`, `searchTeams`, `nextMatch`). Use ESPN, and switch to Highlightly when ESPN fails
  (non-200, bad JSON, missing fields). ESPN team ids and Highlightly team ids differ, so a Team pin
  needs both ids, or the fallback matches by name on the day [inferred]. Highlightly's quota then
  only matters on days ESPN is down.
- **Highlightly for the bar, ESPN for the detail panel:** no point. The bar is the part that eats
  Highlightly's quota, and ESPN carries both.
- **ESPN for everything, football-data.org as fallback:** football-data.org has no daily cap but
  delayed scores and no UEFA Europa or Conference League (#100). It is a weaker fallback than
  Highlightly.
- **FotMob or LiveScore as a second unofficial source:** same terms problem as ESPN, and stricter.
  Not worth it.

## Convex specifics

- Outbound `fetch` from Convex actions leaves through published egress IPs. "These IP addresses are
  shared across all Convex deployments in a region, not just yours." US East uses
  `216.235.222.0/24`, Europe (Ireland) six AWS addresses such as `3.248.173.188` [read:
  [Convex networking](https://docs.convex.dev/production/networking)].
- So any per-IP rate limit at ESPN is shared with every other Convex app in the region that calls
  ESPN [inferred]. Polling once a minute per competition, and only while a pinned team plays, keeps
  this app's share tiny.
- A one-off test from a Convex action on a dev deployment (`fetch` the Serie A scoreboard, log the
  status) would settle the cloud-IP question. It was not run here, since it changes a deployment.

## Open points

1. Does ESPN answer 200 from a Convex action (shared AWS egress IPs)? Test once on a dev
   deployment before the spec relies on it.
2. Does the driving dev accept ESPN's terms risk (automated access to a site whose terms forbid
   it, for a private non-commercial app)? If not, Highlightly free stays the only source.
3. How a Team pin stores ids if two providers are used: ESPN id plus Highlightly id, or name
   matching on fallback.
4. `uefa.euro` shows Euro 2024 as its latest season. Euro 2028 will need a check when its
   qualifiers or finals appear.
