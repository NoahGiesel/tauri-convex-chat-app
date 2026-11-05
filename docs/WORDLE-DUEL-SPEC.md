# Wordle Duel spec

The Wordle Duel is an asynchronous 1v1 Wordle challenge in a direct chat. Both players guess the same hidden five-letter word, each in their own Run, at any time and in any order, before the Duel deadline.

Terms such as Wordle Duel, Run, Run timer, Duel deadline and Rematch are defined in [`GLOSSARY.md`](../GLOSSARY.md).

Decisions and evidence come from [the map](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/73) and its closed tickets:

- [Which Italian and English word lists can the Wordle Duel use?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/74), with findings on the throwaway branch [`research/wordle-word-lists`](https://github.com/NoahGiesel/tauri-convex-chat-app/blob/research/wordle-word-lists/docs/research/wordle-word-lists.md)
- [What do the Wordle Duel card and Run screen look like?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/75), with the prototype on the throwaway branch [`prototype/wordle-duel-ui`](https://github.com/NoahGiesel/tauri-convex-chat-app/tree/prototype/wordle-duel-ui)
- [How is a Wordle Duel stored and scheduled in Convex?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/76)
- [Which Wordle Duel scenarios does the E2E suite drive?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/78)
- [Does a finished Wordle Duel offer a rematch?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/79)
- [What does the finished Wordle Duel spec say?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/77)

The two existing games are the model to follow: stone-paper-scissors (`convex/games.ts`, `convex/gameRules.ts`, `src/components/game-card.tsx`) and the quiz (`convex/quizzes.ts`, `src/components/quiz-card.tsx`). Read `convex/_generated/ai/guidelines.md` before writing Convex code.

## Scope

**In scope:** a 1v1 Duel in direct chats, in Italian or English, with five-letter words, six guesses and a Run timer of 1, 5 or 10 minutes.

**Out of scope:**

- Group chats and more than two players.
- Other languages, other word lengths, and hard mode.
- Pausing the Run timer.

## Rules

- **Async.** Both players guess the same word, each in their own Run, at any time and in any order. The Run timer starts only when that player opens their Run.
- **Setup.** The challenger picks the Run timer (1, 5 or 10 min) and the language (Italian or English). The server picks the word at random. Nobody knows it in advance.
- **Grid.** Classic Wordle: five letters, six guesses. Every guess must be a valid word of the chosen language. Otherwise it is rejected and does not count. No hard mode.
- **Timer.** Server-side only, and it never pauses. Leaving the app or closing the Run window does not stop it. The player may come back while time remains.
- **End of a Run.** A Run ends when the word is guessed (`solved`), after six misses (`missed`), when time runs out (`timeout`), or when the player gives up (`gaveUp`). Giving up counts as not guessing the word.
- **Invite.** The challenged person accepts or declines. The challenger can withdraw before acceptance. An unanswered invite expires after 24 h.
- **Duel deadline.** 24 h after acceptance. A player who has not finished their Run by then loses by forfeit. If neither played, the Duel expires with no winner.
- **Coexistence.** A Wordle Duel does not block other games in the chat, and other games do not block it. At most one open Wordle Duel per chat.

### Winner

1. Fewer guesses wins.
2. On equal guesses, the faster Run wins. Run time is `endedAt - startedAt`.
3. Guessing beats not guessing (six misses, timeout or give up).
4. If neither guessed, it is a draw.
5. A player who did not finish by the Duel deadline loses by forfeit to one who did, whatever that Run's result.

The outcome records the winner, or none for a draw, and the reason: fewer guesses, faster Run, only one guessed, forfeit, or neither guessed.

## Word lists

The lists ship as a generated TypeScript module under `convex/`, with no table. All four lists bundle to about 86 KB.

| List | Source | Rule | Size |
|---|---|---|---|
| English guesses | ESDB `rel-2026.02.25` | Size 80 or below, all forms | About 8,900 |
| English solutions | ESDB `rel-2026.02.25` | Size 35 or below, base forms only, no frequency cut | About 2,330 |
| Italian guesses | Morph-it! 0.4.8, plus a hand-kept include file | All forms | About 4,700 |
| Italian solutions | Morph-it! 0.4.8 and wordfreq `large_it` | All forms, conjugated verbs included, at Zipf 3.0 or more | About 2,150 |

- **Letter rule.** Five lowercase letters a–z. Italian also drops words with accents, apostrophes and j, k, w, x, y. Each guess is lowercased before it is checked.
- **British spellings** are accepted as guesses but never picked as solutions.
- **Every solution is also a guess.** The build script fails otherwise.
- **A committed build script** generates the module from the sources, so the same inputs give the same lists.
- **Hand-review files** live in the repo: an exclude list for solutions (offensive, odd or function words such as *nella*), and an include list for Italian guesses that Morph-it! lacks, such as *capra*, *aceto*, *ovest* and *audio*. The include list starts with the known gaps and one review of wordfreq's 886 candidates. It grows when someone finds a missing word.
- **Server only.** No client file imports the module. The client already imports `convex/quizRules` and `convex/linkRules`, so a Wordle rules module the client imports must not import the lists.
- **Pick the word inside the mutation handler**, never at module scope. A value taken at import time stays fixed until the next deploy.
- **No repeated words in a chat.** The server leaves out words already used in earlier Duels of the same chat and language. Once none are left, it draws from the full list again.
- **Licences.** English stays free of CC BY-SA. The Italian lists derive from CC BY-SA sources and stay CC BY-SA; the app code does not. Credits sit in the module header and in a notices file in the repo: the ESDB copyright notice, and CC BY-SA credit to Baroni and Zanchetta (Morph-it!) and to wordfreq. There is no in-app licences screen.

## Data model

A new table, `wordleDuels`, holds one document per Duel. It is not an extension of `games` or `quizzes`. It holds:

- the conversation, and both players, where A is the challenger;
- the Run timer and the language (`it` or `en`);
- the word;
- the status, plus `createdAt`, `acceptedAt` and `finishedAt`;
- the outcome: the winner, or none for a draw, and the reason;
- both Runs, embedded as `runA` and `runB`.

**A Run** stores `startedAt`, `endsAt` (`startedAt` plus the Run timer), the guessed words in order, `endedAt`, and its end reason: `solved`, `missed`, `timeout` or `gaveUp`. Only the words are stored. The colours are computed on the server from the word.

**Statuses:** `invite`, `open`, `closed`, `declined`, `withdrawn` and `expired`. `expired` covers two cases, told apart by `acceptedAt`: an invite left unanswered for 24 h, and a Duel where neither player finished a Run by the Duel deadline.

**Messages.** A new optional `messages.wordleDuelId`, with `kind: "game"`, the same way `gameId` and `quizId` work.

**One open Duel per chat.** Starting a Duel checks only `wordleDuels` with status `invite` or `open` in that chat. It never reads `games` or `quizzes`, and `games.start` and `quizzes.start` never read `wordleDuels`.

## Secrecy

- Until the Duel is `closed`, no query returns the word or the other player's guesses.
- **The card query** returns each player's state: to play, playing or finished. Once the Duel is closed, it returns the word, both grids, the guess counts, the times and the outcome. It also says whether to show Rematch.
- **The "my Run" query** returns only the caller's own guesses with their colours, plus `endsAt` and the server time. The Run window and See your Run use it.
- **Guesses are checked on the server only.** The app ships no word list.

## Scheduling

| Job | When | What it does |
|---|---|---|
| Invite expiry | `createdAt + 24 h` | An `invite` turns `expired`. No chat message |
| End of Run | `endsAt + GRACE_MS` | A Run still in progress ends with `timeout` |
| Duel deadline | `acceptedAt + 24 h` | Closes the Duel, unless a Run is still in progress |

- **`GRACE_MS` is 500 ms**, as in stone-paper-scissors. A guess arriving up to 500 ms after `endsAt` still counts.
- **A Run can be opened until the Duel deadline.** If a Run is still in progress at the deadline, it finishes its full Run timer, and the Duel closes when that Run ends.
- **At closing,** a player who has not finished a Run loses by forfeit. If neither finished, the Duel becomes `expired`.
- **Early close.** When the second Run ends, the Duel closes at once with the outcome.
- **Every job checks the status first**, and does nothing on a Duel that is already closed.
- **Give up** is a mutation that ends the caller's running Run with `gaveUp`.
- Stone-paper-scissors invites do not expire today, and stay as they are.

## Closing

When a Duel closes (`closed`, or `expired` after acceptance), the server adds a **system message with no author** to the chat. It is a short line, for example "Wordle Duel closed: Marco wins (3 to 4 guesses)". Clicking it scrolls to the Duel's card, which stays in place and shows the full result.

- The message bumps the chat in the list, raises its unread count and fires the existing notification.
- `use-message-notifications.ts` treats a message with no author as an AI reply today. A Wordle Duel result notifies with the chat title and the result line instead.
- An unanswered invite that expires adds no message.
- No notification fires when the other player starts or finishes their Run.

## Stats

A `wordleDuels.history` query sits beside `games.history` and `quizzes.history`, and the "Giochi" tab in Media gets a Wordle section.

- Closed Duels count, forfeits included, as a win for the player who played.
- Expired, declined and withdrawn Duels do not count.
- The extra figure per player is the **average number of guesses over the words they guessed**.

## Rematch

- **Where.** Only on a `closed` Duel, and only on the latest closed Duel in the chat. A newer Duel that ended declined, withdrawn or expired does not count as the latest. Other end states keep their muted line with no button.
- **Hidden while a Duel is open.** While any Wordle Duel in the chat is `invite` or `open`, no card shows Rematch.
- **Who.** Either player. Whoever presses it becomes the challenger.
- **What.** An ordinary invite, with the old Duel's Run timer and language and no popover. The other player accepts or declines, the challenger can withdraw, and it expires after 24 h. It holds no link back to the old Duel. To change the settings, use `/wordle`.
- **Two presses at once.** The second fails on the one-open-Duel rule, and the button then disappears.
- It uses the same start mutation as `/wordle`, and the existing `game.rematch` string.

## Interface

The prototype on [`prototype/wordle-duel-ui`](https://github.com/NoahGiesel/tauri-convex-chat-app/tree/prototype/wordle-duel-ui) is the visual reference. Run `pnpm prototype:wordle` there and open `/?prototype=wordle-duel&variant=D`. Use it as a reference, not as code to copy.

### Setup popover

`/wordle` in a direct chat opens a small popover above the composer, where the slash suggestions appear. It has two segmented controls, Run timer (1, 5, 10 min) and word language (Italiano, English), then **Send challenge** and **Cancel**. The invite is a message and notifies as usual.

### Chat card

In the look of `game-card.tsx`: a header with three tiles (green, yellow, grey), "Wordle Duel", and badges for the Run timer and the language.

- **Invite.** The challenged player gets Accept and Decline. The challenger gets Withdraw. Both see "Expires in …".
- **Open.** A box per player shows To play, Playing… or Finished, never a result. Below is the action: **Start your Run · N min**, with the note "the timer starts when you open the Run and never pauses"; or **Back to your Run · m:ss left**; or **See your Run**. A footer reads "Results stay hidden until both finish. The Duel closes in …". There is no Give up button on the card.
- **Closed.** "The word was", the word as green tiles, then one column per player. Each column has a mini grid with letters and colours, `n/6` or `X/6`, the time, and "(time out)" or "(gave up)". The winner's column has an accent border. Below: "🏆 Name wins" with the reason, or "Draw: neither guessed the word". A player who did not finish in time shows "Did not finish in time". Then Rematch, when it applies.
- **Declined, withdrawn, invite expired, Duel expired.** One muted line each.

### Run window

The Run opens in its own app window, like the chat popout in `src/lib/popout.ts`: a Tauri `WebviewWindow` in the app, a popup in the browser. Opening it again brings the open window to the front. It needs the same session and live updates as the popout, and its window label must be allowed in `src-tauri/capabilities/default.json`, which today lists `main` and `chat-*`.

- **Header:** the language, `n/6`, and the Run timer as a large badge that turns red under 30 s. A note says the timer never pauses.
- **Grid and keyboard:** the 6×5 grid, then an on-screen keyboard. Every key has an accessible name. The Italian keyboard is QWERTY with j, k, w, x, y hidden, not greyed out, and typing them on a physical keyboard does nothing.
- **Rejected guess:** the row shakes and a red line reads, for example, "XXXXX is not in the Italian list. It doesn't count." A short word gets "Not enough letters".
- **Give up:** a button under the keyboard, with a confirm step.
- **End of Run:** a summary reads "Guessed in n · m:ss", "Time's up", "Six misses" or "You gave up". While the other player has not finished, it adds that the result and the word appear when they finish, or when the Duel closes.
- **See your Run:** after finishing, while the Duel is open, the window reopens read-only with the player's own grid, guesses and time.

**Tile colours come from the theme:** correct is `--app-online`, present is `--app-upload`, absent is `--app-raised`, with `--app-bg` text. They follow every preset.

## Strings and release notes

- Each implementation ticket adds its own strings in all five languages in `src/i18n`. The `Messages` type fails the build if a language misses a key.
- Rematch reuses `game.rematch`.
- The release notes get one Wordle Duel item in English and Italian, in the `"next"` entry of `src/data/release-notes.ts`. The Launch ticket adds it, together with removing the gate. No earlier ticket adds release notes.

## Release gate

Implementation tickets merge into `master` one by one, and a release can be cut between them. So `/wordle` shows only when `import.meta.env.DEV` is true or `VITE_E2E` is `"1"`, until the Launch ticket removes the gate.

- The Test build sets `VITE_E2E`, so the E2E scenario runs before Launch. The release guard already refuses `VITE_E2E` in a release, so production stays closed.
- The backend parts (table, functions, the optional message field) reach production with each `npx convex deploy`. They are additive, and nothing calls them before Launch.

## Testing

**`convex-test` covers every rule and scheduled job,** with fake timers, beside the code in `convex/`: invite expiry, the Run timeout and its grace, the Duel deadline, forfeit, a Duel that expires with no winner, scoring and tie-breaks, colours with repeated letters, rejected guesses, giving up, the secrecy of the queries, one open Duel per chat, no repeated words, Rematch visibility and the stats. The word lists get tests for the letter rule and for "every solution is a guess". Each implementation ticket adds the tests for its part.

**E2E drives one scenario, the core flow.** Alice sends `/wordle` with a Run timer and a language. Bob accepts. Both play their Run in the Run window. Both see the closed card with the word, both grids and the winner, and the result line in the chat. Alice solves in fewer guesses, so she wins every time.

- **Fixture and Seed:** `twoFriendsWithChatOpen` on the `friends` Seed. No new Seed. The Fixture gains domain actions such as sending a challenge, accepting, opening the Run, guessing and reading the card.
- **Actors:** Alice and Bob are both Driven users, and both play through the UI.
- **The hidden word:** a stage-only internal function in `e2e/stage-seed.ts` sets the open Duel's word to a fixed word. The Fixture calls it after acceptance, so test code holds literal guesses. Like all Seed code, it never enters the repo's `convex/`.
- **Typing:** the on-screen keyboard, by accessible name. It works with the window in the background, where key events would need focus.
- **The Run window** is found as the one new window handle, as `popOut` does in `e2e/fixtures.mjs`. The Reset already closes every window but `main`. That the Run window can be driven is expected but not proven; the E2E ticket proves it.
- **Not in E2E:** decline, withdraw, rejected guesses, giving up, See your Run, timeout, forfeit and expiry. The unit tests cover their rules.
- `docs/E2E-SPEC.md` gains a row for the scenario, and the Manual smoke gains one step: play a Wordle Run with the physical keyboard.

## Implementation order

The work is split into vertical tickets, one PR each. GitHub holds the blocking edges. The word lists and the invite can run in parallel; after that, each ticket waits for the one before it.

1. [The Wordle Duel word lists are generated](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/80)
2. [Two friends can send and answer a Wordle Duel invite](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/81)
3. [A player can play their Wordle Run](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/82)
4. [A Wordle Duel closes with a result](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/83)
5. [Wordle Duels count in the Games tab](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/84)
6. [A closed Wordle Duel offers a rematch](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/85)
7. [The E2E suite plays a Wordle Duel](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/86)
8. [The Wordle Duel is released](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/87)

## What is not verified

- Nothing was pushed to a Convex deployment. The bundle size and the "no per-module limit" finding come from esbuild and from reading the backend source. The cloud service may enforce more.
- The ESDB counts come from a custom parser, not the official tool, so they may be off by a few percent. The solution lists were sampled, not reviewed word by word.
- The licence readings are not legal advice.
- The Run window has not been driven by the E2E suite.
