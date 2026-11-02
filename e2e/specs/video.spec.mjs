import { twoFriendsWithChatOpen } from '../fixtures.mjs';

// clip.mp4 in e2e/assets is H.264 Constrained Baseline, which WebView2 decodes. docs/E2E-SPEC.md says how it was made.
describe('sending a video', () => {
  it('a video reaches the friend, whose player reads it', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();
    await alice.attach('clip.mp4');
    await alice.seesStaged('clip.mp4');

    await alice.send('A short clip');

    await alice.seesVideoWithCaption('A short clip');
    await bob.seesVideoWithCaption('A short clip');
  });
});
