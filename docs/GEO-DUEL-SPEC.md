# Geo Duel spec

The Geo Duel is an asynchronous 1v1 map challenge in a direct chat. Both players get the same places, one Round at a time, each in their own Run, at any time and in any order, before the Duel deadline. In each Round the player sees a place's name and clicks where it is on a map with no labels. The closer the click, the more points.

Terms such as Geo Duel, Run, Round, Round timer, Duel deadline and Rematch are defined in [`GLOSSARY.md`](../GLOSSARY.md).

Decisions and evidence:

- Imagery research, kept only for the map part: the throwaway branch `research/geo-duel-imagery`, file `docs/research/geo-duel-imagery.md`. Photo panoramas (Mapillary, Street View) were dropped for a map-only game; what still holds is the MapLibre GL + OpenFreeMap section.
- UI prototype: the throwaway branch `prototype/geo-duel-ui`. Run `pnpm prototype:geo` there. **Variant A won**: full-screen map, the place's name is the clue, the result in a bar at the bottom.
- Asked and decided (2026-11-14): the Duel is async like the Wordle Duel, and places come from a city list only. No AI picks places, writes clues or gives coordinates.

The Wordle Duel is the model to follow, for the card, the window, the scheduling and the closing: [`docs/WORDLE-DUEL-SPEC.md`](WORDLE-DUEL-SPEC.md), `convex/wordleDuels.ts`, `src/components/wordle/`. Read `convex/_generated/ai/guidelines.md` before writing Convex code.

## Scope

**In scope:** a 1v1 Duel in direct chats, three Zones (Italy, Europe, World), 3 or 5 Rounds, a fixed Round timer of 60 seconds.

**Out of scope:**

- Group chats and more than two players.
- Photos, panoramas, clues other than the name, and AI.
- Playing live, with both players at the same time.
- Choosing the Round timer, and pausing it.

## Rules

- **Async.** Both players get the same places in the same order, each in their own Run, at any time and in any order.
- **Setup.** The challenger must pick a Zone (Italy, Europe or World) and the number of Rounds; there is no default Zone. The server picks the places at random from that Zone of the city list when the challenge is sent, and stores them on the Duel. From then on they are fixed: both players get the same places in the same order, and a Rematch picks new ones. Nobody knows them in advance.
- **Round.** The Round starts when the player opens it: the server returns the place's name and starts the Round timer. The player clicks the map to place a pin, can move it, and confirms with **Guess**. The Round ends at Guess or when the Round timer runs out.
- **Between Rounds** no timer runs. The next Round starts when the player opens it.
- **Timer.** 60 seconds per Round, server-side only. It never pauses. Leaving the app or closing the window does not stop it.
- **Time up.** If the window is open with a pin on the map, the client sends that pin as the guess, within the grace. Otherwise the Round scores 0.
- **End of a Run.** A Run ends when its last Round ends, or when the player gives up. Giving up scores 0 on every Round not yet played.
- **Invite, Duel deadline, coexistence.** As in the Wordle Duel: accept, decline or withdraw; the invite expires after 24 h; the Duel deadline is 24 h after acceptance; at most one open Geo Duel per chat; a Geo Duel neither blocks nor is blocked by other games.

### Points

`points = round(5000 · e^(−d / scale))`, where `d` is the great-circle (haversine) distance in km between the pin and the place, and `scale` depends on the Zone:

| Zone | Places from | Scale |
|---|---|---|
| Italy | Italy | 150 km |
| Europe | European countries | 500 km |
| World | Every country | 2,000 km |

So a Run scores at most 5,000 per Round. A Round with no guess scores 0. The scales come from the prototype and may be tuned after playing.

### Winner

1. More total points wins.
2. On equal points, the faster Run wins. Run time is the sum of each Round's `endedAt - startedAt`, so the time between Rounds does not count.
3. If both are still equal, it is a draw.
4. A player who did not finish by the Duel deadline loses by forfeit to one who did, whatever that Run's score.

The outcome records the winner, or none for a draw, and the reason: more points, faster Run, or forfeit.

## City list

The list ships as a generated TypeScript module under `convex/`, with no table, like the Wordle word lists.

- **Source:** GeoNames `cities15000` (every place with 15,000 people or more), plus `countryInfo.txt` for the continent. Licence CC BY 4.0: the credit goes in `NOTICES.md` and in the module header.
- **Filter per Zone:** Italy takes Italian places with 15,000 people or more. Europe and World take places with 100,000 people or more, plus every capital. The thresholds are a first guess, to tune by playing: a World Round on a town nobody knows is not fun.
- **Each entry** stores the GeoNames id, the name, the country code, and the latitude and longitude, rounded to 4 decimals (about 10 m).
- **The name shown** is the Italian name from GeoNames alternate names when there is one (Cracovia, not Kraków), else the GeoNames name. Other app languages are an open question.
- **A hand-review exclude file** removes odd or duplicate entries, for example a district listed as a city.
- **A committed build script**, `scripts/geo-places/build.mjs`, makes the module from the sources, so the same inputs give the same list.
- **Server only.** No client file imports the module. A rules module the client imports must not import the list.
- **Pick the places inside the mutation handler**, never at module scope.
- **No repeated places in a chat.** The server leaves out places used in earlier Duels of the same chat and Zone. Once none are left, it draws from the full list again.

## Data model

A new table, `geoDuels`, holds one document per Duel. It holds:

- the conversation, and both players, where A is the challenger;
- the Zone and the number of Rounds;
- the places, as GeoNames ids in Round order;
- the status, plus `createdAt`, `acceptedAt` and `finishedAt`;
- the outcome: the winner, or none for a draw, and the reason;
- both Runs, embedded as `runA` and `runB`.

**A Run** stores one entry per Round played: `startedAt`, `endsAt`, `endedAt`, the pin (latitude and longitude, or none), the distance and the points. It also stores the Run's `endedAt`, and `gaveUp` when the player gave up.

**Statuses** are the Wordle Duel's: `invite`, `open`, `closed`, `declined`, `withdrawn` and `expired`.

**Messages.** A new optional `messages.geoDuelId`, with `kind: "game"`, like `wordleDuelId`.

## Secrecy

- **A Round's place name** is returned only once the player opens that Round.
- **A Round's coordinates** are returned only once that Round has ended for the player.
- **The other player's pins, distances and points** are returned only once the Duel is `closed`.
- **The card query** returns each player's state (to play, playing, finished) and, once closed, both Runs and the outcome.
- **The "my Run" query** returns only the caller's own Rounds, plus `endsAt` and the server time.
- **Distances and points are computed on the server only.** The client only sends a pin.

## Scheduling

| Job | When | What it does |
|---|---|---|
| Invite expiry | `createdAt + 24 h` | An `invite` turns `expired`. No chat message |
| End of Round | `endsAt + GRACE_MS` | A Round still in progress ends with no guess and 0 points |
| Duel deadline | `acceptedAt + 24 h` | Closes the Duel, unless a Round is still in progress |

- **`GRACE_MS` is 500 ms**, as in the Wordle Duel.
- **A Run in progress at the deadline** finishes its current Round. No new Round can open after the deadline; the Rounds not played score 0. The Duel closes when that Round ends.
- **Forfeit, expiry, early close and status checks** work as in the Wordle Duel.

## Closing

As in the Wordle Duel: a system message with no author, for example "Geo Duel closed: Marco wins (18,240 to 15,910)". Clicking it scrolls to the card. It notifies with the chat title and the result line.

## Stats

A `geoDuels.history` query, and a Geo Duel section in the "Giochi" tab in Media. Wins count as in the Wordle Duel. The extra figure per player is the **average points per Round**.

## Rematch

As in the Wordle Duel, with the old Duel's Zone and number of Rounds. To change the settings, use `/geo`.

## Interface

The prototype on `prototype/geo-duel-ui`, variant A, is the visual reference. Use it as a reference, not as code to copy.

### Setup popover

`/geo` in a direct chat opens the same kind of popover as `/wordle`, with two segmented controls, Zone (Italia, Europa, Mondo) and Rounds (3, 5), then **Send challenge** and **Cancel**. No Zone is selected at first, and **Send challenge** stays disabled until one is.

### Chat card

In the look of the Wordle Duel card: a header with a globe icon, "Geo Duel", and badges for the Zone and the Rounds.

- **Invite and Open:** as in the Wordle Duel. The action reads **Start your Run · N Rounds**, **Back to your Run · Round n/N**, or **See your Run**, with the note "each Round has 60 seconds that never pause".
- **Closed:** one column per player with the total, then one row per Round: the place, each player's distance and points, with the better one in bold. The winner's column has an accent border. Below: "🏆 Name wins" with the reason, or "Draw". Then Rematch, when it applies.
- **Declined, withdrawn, invite expired, Duel expired:** one muted line each.

### Run window

The Run opens in its own app window through `openAppWindow` in `src/lib/popout.ts`, with the label `geo-<duelId>`, which must be allowed in `src-tauri/capabilities/default.json`. Suggested size 1100×750, minimum 720×520.

- **Map:** MapLibre GL JS on OpenFreeMap, full window. The style drops every `symbol` layer, so the map shows no names. There is a light style and a dark one, following the app theme. No rotation and no tilt. The OpenFreeMap / OpenMapTiles / OpenStreetMap credit stays visible. MapLibre is loaded only in this window, through a dynamic import.
- **Before a Round:** a card with "Round n/N" and **Start Round**, so the Round timer never starts unseen.
- **During a Round:** at the top centre, "Round n/N · Zone" and "Where is **Name**?". Top left the points so far, top right the Round timer, red under 10 s. Bottom right **Guess**, disabled until a pin is placed, with "Click on the map" as its label.
- **After a Round:** the pin, the place and a dashed line between them, with the camera fitting both. A bar at the bottom shows the place and its country, the distance, a points bar and the points, then **Next Round** or **See the result**.
- **End of the Run:** a panel with each Round's place, distance and points, and the total. While the other player has not finished, it says their result appears when they finish or when the Duel closes. Once closed, it shows both players' pins on the map and the winner.
- **Give up:** a quiet button with a confirm step.

**Pin colours:** the player blue (`#2563eb`), the other player orange (`#f97316`), the place green (`#16a34a`), the same in every theme.

## Strings and release notes

- Each implementation ticket adds its own strings in all five languages in `src/i18n`.
- Rematch reuses `game.rematch`.
- The Launch ticket adds one Geo Duel item in English and Italian to the `"next"` entry of `src/data/release-notes.ts`, together with removing the gate.

## Release gate

As in the Wordle Duel: `/geo` shows only when `import.meta.env.DEV` is true or `VITE_E2E` is `"1"`, until the Launch ticket removes the gate. The backend parts are additive and reach production with each `npx convex deploy`, but nothing calls them before Launch.

## Testing

**`convex-test` covers every rule and scheduled job,** with fake timers: invite expiry, the Round timeout and its grace, a Round that cannot open after the deadline, the Duel deadline, forfeit, expiry with no winner, the winner and tie-breaks, giving up, the secrecy of each query, one open Duel per chat, no repeated places and the stats. `geoRules.ts` gets unit tests for the haversine distance on known city pairs and for the points formula. The city list gets tests for the Zone filters and for no duplicate ids.

**E2E drives one scenario, the core flow.** Alice sends `/geo` with Italy and 3 Rounds. Bob accepts. Both play their Run in the Run window. Both see the closed card and the result line in the chat.

- **Fixture and Seed:** `twoFriendsWithChatOpen` on the `friends` Seed.
- **The places:** a stage-only internal function in `e2e/stage-seed.ts` sets the open Duel's places to fixed ones at the centre of the Zone's starting view. Alice clicks the centre of the map, so she scores near the maximum; Bob clicks near a corner. Alice wins every time.
- **The Run window** is found as the one new window handle, as for the Wordle Run.
- **Not in E2E:** decline, withdraw, timeout, giving up, forfeit and expiry. The unit tests cover their rules.
- Clicking a WebGL map with WebDriver is expected to work but not proven. The E2E ticket proves it.

## Implementation order

Vertical tickets, one PR each, as for the Wordle Duel. The city list and the invite can run in parallel; after that, each ticket waits for the one before it.

1. The Geo Duel city list is generated
2. Two friends can send and answer a Geo Duel invite
3. A player can play their Geo Run
4. A Geo Duel closes with a result
5. Geo Duels count in the Games tab
6. A closed Geo Duel offers a rematch
7. The E2E suite plays a Geo Duel
8. The Geo Duel is released

## What is not verified

- The size of the city list per Zone and of the generated module has not been measured.
- GeoNames alternate names have not been checked for Italian coverage, nor how to show names in the other app languages.
- The OpenFreeMap dark style has not been tried without labels.
- The CC BY 4.0 reading for GeoNames is not legal advice.
- MapLibre in the Tauri WebViews was seen only in the browser prototype, not in the app on macOS or Windows.
