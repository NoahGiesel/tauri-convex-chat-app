import { twoFriendsWithChatOpen } from '../fixtures.mjs';

describe('Wordle Duel', () => {
  it('both play their Run, and both see the result', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();

    await alice.challengeToWordle({ minutes: 5, language: 'English' });
    await bob.acceptWordleDuel({ hiddenWord: 'crane' });

    await alice.openWordleRun();
    await alice.guessWord('slate');
    await alice.guessWord('crane');
    await alice.seesRunSolvedIn(2);
    await alice.returnToMainWindow();

    await bob.openWordleRun();
    await bob.guessWord('slate');
    await bob.guessWord('pious');
    await bob.guessWord('crane');
    await bob.seesRunSolvedIn(3);
    await bob.returnToMainWindow();

    for (const player of [alice, bob]) {
      await player.seesWordleResult({
        word: 'crane',
        guesses: { 'Alice Test': ['slate', 'crane'], 'Bob Test': ['slate', 'pious', 'crane'] },
        winner: 'Alice Test',
      });
      await player.sees('Wordle Duel closed: Alice Test wins (2 to 3 guesses)');
    }
  });
});
