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
