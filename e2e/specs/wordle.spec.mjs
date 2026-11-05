import { twoFriendsWithChatOpen } from '../fixtures.mjs';

describe('Wordle Duel', () => {
  it('both play their Run, and both see the result', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();
    const word = 'crane';
    const aliceGuesses = ['slate', word];
    const bobGuesses = ['slate', 'pious', word];

    await alice.challengeToWordleDuel({ minutes: 5, language: 'English' });
    await bob.acceptWordleDuel({ hiddenWord: word });

    await alice.openWordleRun();
    for (const guess of aliceGuesses) await alice.guessWord(guess);
    await alice.seesRunSolvedIn(aliceGuesses.length);
    await alice.returnToMainWindow();

    await bob.openWordleRun();
    for (const guess of bobGuesses) await bob.guessWord(guess);
    await bob.seesRunSolvedIn(bobGuesses.length);
    await bob.returnToMainWindow();

    for (const player of [alice, bob]) {
      await player.seesWordleResult({ word, guesses: { 'Alice Test': aliceGuesses, 'Bob Test': bobGuesses }, winner: 'Alice Test' });
      await player.seesWordleWonInFewerGuesses('Alice Test', [aliceGuesses.length, bobGuesses.length]);
    }
  });
});
