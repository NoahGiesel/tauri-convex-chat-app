import { settingsOpen } from '../fixtures.mjs';

// Each test starts on the default dark theme, Graphite, in English, with the sidebar on the left.
// None calls "Check for updates", which would reach the real update endpoint.
describe('appearance settings', () => {
  it('a theme chosen in Settings applies at once', async () => {
    const { alice } = await settingsOpen();
    await alice.showSettings('appearance');

    await alice.chooseTheme('Forest');

    await alice.seesThemeInUse('Forest');
  });

  it('light mode switches to a light theme', async () => {
    const { alice } = await settingsOpen();
    await alice.showSettings('appearance');

    await alice.chooseLightMode();

    await alice.seesLightMode();
    await alice.seesThemeInUse('Daylight');
  });

  it('a custom accent colour applies at once', async () => {
    const { alice } = await settingsOpen();
    await alice.showSettings('appearance');

    await alice.chooseAccent('#d14b8f');

    await alice.seesColour('--app-accent', '#d14b8f');
  });

  it('the sidebar can move to the right', async () => {
    const { alice } = await settingsOpen();
    await alice.showSettings('appearance');

    await alice.placeSidebar('right');
    await alice.backToChats();

    await alice.seesSidebarOn('right');
  });

  it('an imported theme is added and used', async () => {
    const { alice } = await settingsOpen();
    await alice.showSettings('appearance');

    await alice.importTheme('harbour-theme.json');

    await alice.seesThemeInUse('Harbour Test');
  });

  it('a file that is not a theme is refused', async () => {
    const { alice } = await settingsOpen();
    await alice.showSettings('appearance');

    await alice.importTheme('note.txt');

    await alice.seesThemeRefused();
    await alice.seesThemeInUse('Graphite');
  });

  it('update notices can be switched off, and stay off after a reload', async () => {
    const { alice } = await settingsOpen();
    await alice.showSettings('updates');
    await alice.seesUpdateNotices(true);

    await alice.toggleUpdateNotices();
    await alice.seesUpdateNotices(false);
    await alice.reload();
    await alice.openSettings();
    await alice.showSettings('updates');

    await alice.seesUpdateNotices(false);
  });
});

describe('language settings', () => {
  it('each of the five languages shows its own words, and the last one stays after a reload', async () => {
    const { alice } = await settingsOpen();
    await alice.showSettings('preferences');
    await alice.seesLanguageListIn('English');

    // Back to English on the way, so that switching back is covered too. Spanish comes last, and must stay.
    for (const language of ['Deutsch', 'Italiano', 'Română', 'English', 'Español']) {
      await alice.chooseLanguage(language);
      await alice.seesLanguageListIn(language);
    }
    await alice.reload();

    await alice.seesSettingsButtonIn('Español');
  });
});
