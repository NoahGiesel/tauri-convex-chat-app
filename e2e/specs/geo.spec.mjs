import { twoFriendsWithChatOpen } from '../fixtures.mjs';

/** Rome, three times: the Italy map starts centred about 12 km from it. */
const ROME = 3169070;

describe('Geo Duel', () => {
  it('both play their Run, and both see the result', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();

    await alice.challengeToGeoDuel({ zone: 'Italy', rounds: 3 });
    await bob.acceptGeoDuel({ places: [ROME, ROME, ROME] });

    // Alice clicks the centre of the map, near Rome; Bob far from it, towards a corner.
    await alice.openGeoRun();
    await alice.playGeoRun({ rounds: 3, offset: { x: 0, y: 0 } });
    await alice.returnToMainWindow();

    await bob.openGeoRun();
    await bob.playGeoRun({ rounds: 3, offset: { x: -250, y: -200 } });
    await bob.returnToMainWindow();

    for (const player of [alice, bob]) await player.seesGeoWinner('Alice Test');
  });
});
