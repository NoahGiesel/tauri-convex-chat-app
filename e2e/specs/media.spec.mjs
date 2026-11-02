import { mediaChatOpen } from '../fixtures.mjs';

// The media Seed: Alice sent Bob sunset.png as "Seeded photo", clip.mp4 as "Seeded video", and "Seeded link"
// with https://example.com/seeded-page, whose Seeded preview is titled "A Seeded page". Alice has a profile photo.
describe('what a chat already holds', () => {
  it('a photo opens full size, and closes', async () => {
    const { bob } = await mediaChatOpen();
    await bob.seesPhotoWithCaption('sunset', 'Seeded photo');

    await bob.openPhoto('sunset');
    await bob.seesPhotoInLightbox('sunset.png');
    await bob.closeLightbox();

    await bob.stopsSeeingLightbox();
  });

  it('the media library shows the photo and the video, and opens the video full size', async () => {
    const { bob } = await mediaChatOpen();

    await bob.openLibrary();
    await bob.seesPhotoInLibrary('sunset.png');
    await bob.seesVideoInLibrary('clip.mp4');
    await bob.openFromLibrary('clip.mp4');

    await bob.seesVideoInLightbox('clip.mp4');
  });

  it('the link library lists the link by its preview title', async () => {
    const { bob } = await mediaChatOpen();
    await bob.openLibrary();

    await bob.showLibraryLinks();

    await bob.seesInLinkLibrary('A Seeded page');
  });

  it('a link shows its Seeded preview card', async () => {
    const { bob } = await mediaChatOpen();

    await bob.seesMessage('Seeded link');

    await bob.seesPreviewCard('A Seeded page');
  });

  // Removing it deletes its file from Convex storage, so only the snapshot can bring it back.
  it("Alice's profile photo comes back with the next Reset, even once removed", async () => {
    const { alice, bob } = await mediaChatOpen();
    await bob.seesProfilePhotoOf('Alice Test');
    await alice.removeProfilePhotoElsewhere();
    await bob.stopsSeeingProfilePhotoOf('Alice Test');

    const after = await mediaChatOpen();

    await after.bob.seesProfilePhotoOf('Alice Test');
  });

  it('deleting a photo deletes its file, and the next Reset brings the photo back', async () => {
    const { alice, bob, storage } = await mediaChatOpen();
    await alice.seesPhotoWithCaption('sunset', 'Seeded photo');
    const file = await alice.photoFile('sunset');

    await alice.deleteMessage('Seeded photo');

    await bob.stopsSeeingMessage('Seeded photo');
    await storage.seesFileDeleted(file);
    const after = await mediaChatOpen();
    await after.bob.seesPhotoWithCaption('sunset', 'Seeded photo');
  });
});

describe('link previews', () => {
  // .invalid is reserved and never resolves, so the server's attempt goes nowhere.
  it('a link to a .invalid address shows no card', async () => {
    const { alice, bob } = await mediaChatOpen();

    await alice.send('https://nothing.invalid/page');

    await bob.seesNoPreviewCard('https://nothing.invalid/page');
  });
});
