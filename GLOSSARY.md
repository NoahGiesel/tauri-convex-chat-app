# Chat

A private desktop chat for a few friends. This glossary holds the project-specific language, starting with the terms used to test the app.

## Language

**Test backend**:
The disposable backend that a single run of the E2E suite owns. It holds only Seeds and data created by the tests, and it never holds real data.
_Avoid_: Dev deployment, local deployment

**Test build**:
The build of the app made only for the E2E suite. It talks only to the Test backend and is never released.
_Avoid_: Debug build, dev build

**Seed**:
A named, deterministic set of data placed in the Test backend, such as users, friendships and conversations. Every Seed extends the Base Seed.
_Avoid_: Test data, sample data

**Base Seed**:
The Seed holding the users that all other Seeds share, and nothing else.
_Avoid_: Default Seed, users Seed

**Reset**:
Returning the Test backend to exactly one Seed before a test starts.
_Avoid_: Cleanup, teardown

**Driven user**:
A user in a test who acts through their own running instance of the app.
_Avoid_: Real user, UI user

**Scripted user**:
A user in a test who acts through public functions and has no instance of the app.
_Avoid_: Fake user, bot, third user

**Manual smoke**:
The short check a person does on the installed app before a release is published, covering what automated tests cannot reach.
_Avoid_: Manual QA, sanity test

**Fixture**:
A ready-made scenario handed to a test, such as two friends signed in with their chat open. A Fixture consumes exactly one Seed.
_Avoid_: Test setup, Seed

### Messages

**Pinned message**:
A message fixed at the top of a chat or group so that every member can find it again. It is not a Team pin, which fixes a football team, not a message.
_Avoid_: Pin (alone)

**System line**:
A short line in a chat's timeline that reports something that happened in the chat, such as who added or removed a Team pin. Nobody sent it, and it does not count as an unread message.
_Avoid_: System message, notice, event

### Games

**Wordle Duel**:
A challenge between the two people of a direct chat, who each try to guess the same hidden five-letter word on their own, at any time, before the Duel deadline.
_Avoid_: Wordle game, Wordle match, Wordle challenge

**Run**:
One player's own attempt at the word inside a Wordle Duel, from opening it to guessing the word, using all six guesses, running out of time, or giving up. Giving up counts as not guessing the word.
_Avoid_: Turn, round, game

**Run timer**:
The time limit of a Run, chosen by the challenger as 1, 5 or 10 minutes. It starts when the player opens their Run and never pauses.
_Avoid_: Countdown, clock

**Duel deadline**:
The moment, 24 hours after the invite is accepted, when a Wordle Duel closes. A player who has not finished their Run by then loses by forfeit.
_Avoid_: Expiry, timeout

**Rematch**:
A new invite sent from a finished game's card to the same person, with the same settings. Whoever sends it becomes the challenger, and the other person accepts or declines it as usual.
_Avoid_: Replay, revenge, new game

### Football

**Team pin**:
A football team fixed at the top of a direct chat, so that its match shows there. Either person of the chat can add or remove it, and both see it. A chat can hold more than one Team pin.
_Avoid_: Pinned team, followed team, subscription

**Match bar**:
The strip at the top of a direct chat that shows a Team pin's match: the next match before kick-off, the live score while it is played, and the final score for a while after. When two pinned teams play each other, one Match bar shows that match.
_Avoid_: Score banner, live widget, header

**Match drawer**:
The panel beside a direct chat that opens from a Match bar. It shows a Team pin's match, its other matches and its standings.
_Avoid_: Detail panel, side panel

**Derby**:
A match between two Team pins of the same chat. While it is the match of both teams, one Match bar shows it.
_Avoid_: Head-to-head, shared match
