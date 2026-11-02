import { twoFriendsWithChatOpen } from '../fixtures.mjs';

// The photos are in e2e/assets. They go through the app's real upload, to the local stub in place of R2.
describe('sending photos', () => {
  it('a photo reaches the friend, and loads', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();
    await alice.attach('sunset.png');
    await alice.seesStaged('sunset.png');

    await alice.sendStaged();

    await alice.seesPhoto('sunset');
    await bob.seesPhoto('sunset');
  });

  it('a caption goes with the photo', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();
    await alice.attach('sunset.png');
    await alice.seesStaged('sunset.png');

    await alice.send('Look at this');

    await bob.seesPhotoWithCaption('sunset', 'Look at this');
  });

  it('several photos go in one message', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();
    await alice.attach('sunset.png', 'harbour.png');
    await alice.seesStaged('sunset.png');
    await alice.seesStaged('harbour.png');

    await alice.sendStaged();

    await bob.seesPhotosTogether('sunset', 'harbour');
  });

  it('a photo taken back before sending is not sent', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();
    await alice.attach('sunset.png', 'harbour.png');
    await alice.seesStaged('harbour.png');

    await alice.removeStaged('harbour.png');
    await alice.stopsSeeingStaged('harbour.png');
    await alice.sendStaged();

    await bob.seesPhoto('sunset');
    await bob.doesNotSeePhoto('harbour');
  });

  it('a file that is not a photo or video is refused', async () => {
    const { alice } = await twoFriendsWithChatOpen();

    await alice.attach('note.txt');

    await alice.seesWrongFileType();
    await alice.stopsSeeingStaged('note.txt');
  });

  it('a message takes ten files, and refuses the rest', async () => {
    const { alice } = await twoFriendsWithChatOpen();

    await alice.attachCopies('sunset.png', 11);

    await alice.seesTooManyFiles();
    await alice.seesStagedCount(10);
  });
});
