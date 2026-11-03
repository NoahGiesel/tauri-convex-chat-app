import { settingsOpen } from '../fixtures.mjs';

// The friends Seed, where Alice Test has no profile photo and no bio, and sent Bob "Seeded hello".
describe('profile settings', () => {
  // First, because it also proves the file input in Settings takes the upload helper.
  it('a profile photo chosen in Settings reaches the friend', async () => {
    const { alice, bob } = await settingsOpen();

    await alice.chooseProfilePhoto('harbour.png');

    await alice.seesPhotoUpdated();
    await alice.seesOwnProfilePhoto();
    await bob.seesProfilePhotoOf('Alice Test');
  });

  it('a removed profile photo goes for the friend too', async () => {
    const { alice, bob } = await settingsOpen();
    await alice.chooseProfilePhoto('harbour.png');
    await bob.seesProfilePhotoOf('Alice Test');

    await alice.removeProfilePhoto();

    await alice.seesPhotoRemoved();
    await bob.stopsSeeingProfilePhotoOf('Alice Test');
  });

  it('a new name reaches the friend live', async () => {
    const { alice, bob } = await settingsOpen();
    await bob.openProfileOf('Alice Test', 'Seeded hello');

    await alice.setName('Alicia Test');
    await alice.saveProfile();

    await alice.seesProfileSaved();
    await bob.seesProfileOf('Alicia Test');
    await bob.seesTab('Alicia Test');
    await bob.seesChatInList('Alicia Test');
  });

  it('a bio reaches the friend live', async () => {
    const { alice, bob } = await settingsOpen();
    await bob.openProfileOf('Alice Test', 'Seeded hello');

    await alice.setBio('Out sailing');
    await alice.saveProfile();

    await alice.seesProfileSaved();
    await bob.seesBio('Alice Test', 'Out sailing');
  });
});
