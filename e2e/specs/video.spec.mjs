import { twoFriendsWithChatOpen } from '../fixtures.mjs';

// clip.mp4 in e2e/assets is a 2 s H.264 video, 160 by 120, with no sound.
describe('sending a video', () => {
  it('a video reaches the friend, whose player can play it', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();
    await alice.attach('clip.mp4');
    await alice.seesStaged('clip.mp4');

    await alice.send('A short clip');

    await alice.seesVideoWithCaption('A short clip');
    await bob.seesVideoWithCaption('A short clip');
  });
});
