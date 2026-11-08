import { twoFriendsWithTeamPins } from '../fixtures.mjs';
import { LIVE_DETAILS } from '../stub.mjs';

// ESPN is the local stub. Alice and Bob's chat has no Team pins. Alice's chat with Carol has a live Inter and the
// AC Milan–Juventus derby; with Dave, Napoli's finished match, Arsenal's postponed one and Real Madrid's, whose live
// score stopped arriving; with Erin, Atalanta, which has no match. Weekend is a group chat.
describe('Team pins', () => {
  it('a team pinned with /calcio shows for both, with its System line', async () => {
    const { alice, bob } = await twoFriendsWithTeamPins();

    await alice.searchTeams('inter');
    await alice.seesTeamInPicker('Internazionale');
    await alice.pickTeam('Internazionale');

    for (const user of [alice, bob]) {
      await user.seesSystemLine('📌 Alice Test pinned Internazionale');
      await user.seesChip('Internazionale', 'live');
    }
  });

  it('the picker finds a national team by its Italian name', async () => {
    const { alice } = await twoFriendsWithTeamPins();

    await alice.searchTeams('italia');

    await alice.seesTeamInPicker('Italy', 'National team');
  });

  it('the picker refuses a team already pinned, and a 4th pin', async () => {
    const { alice } = await twoFriendsWithTeamPins();
    await alice.openChat('Carol Test');

    await alice.searchTeams('inter');
    await alice.pickTeam('Internazionale');
    await alice.seesPickerRefusal('Internazionale is already pinned');

    await alice.searchTeamsAgain('napoli');
    await alice.pickTeam('Napoli');
    await alice.seesPickerRefusal('This chat already has 3 Team pins. Remove one first.');
  });

  it('either friend removes a pin, for both, with its System line', async () => {
    const { alice, bob } = await twoFriendsWithTeamPins();
    await alice.searchTeams('inter');
    await alice.pickTeam('Internazionale');
    await bob.seesChip('Internazionale', 'live');

    await bob.unpin('Internazionale');

    for (const user of [alice, bob]) {
      await user.seesSystemLine('📌 Bob Test unpinned Internazionale');
      await user.seesNoChip('Internazionale');
    }
  });

  it('every seeded chip shows its state', async () => {
    const { alice } = await twoFriendsWithTeamPins();

    await alice.openChat('Carol Test');
    await alice.seesChip('Internazionale', 'live');
    await alice.seesChip('AC Milan', 'next');

    await alice.openChat('Dave Test');
    await alice.seesChip('Napoli', 'finished');
    await alice.seesChip('Arsenal', 'postponed');
    await alice.seesUnavailableChip('Real Madrid');

    await alice.openChat('Erin Test');
    await alice.seesChip('Atalanta', 'none');
    await alice.sees('No match scheduled');
  });

  it("the live chip opens the match's events, lineups and stats; a match not yet started shows only its header", async () => {
    const { alice } = await twoFriendsWithTeamPins();
    await alice.openChat('Carol Test');
    await alice.seesChip('Internazionale', 'live');

    await alice.openMatch('Internazionale');
    await alice.seesDrawerSections(['Events', 'Lineups', 'Stats']);
    await alice.seesInDrawer(LIVE_DETAILS.scorer);
    await alice.seesInDrawer(LIVE_DETAILS.venue);
    await alice.seesInDrawer('Possession');
    await alice.closeMatch();

    await alice.openMatch('AC Milan');
    await alice.seesOnlyDrawerHeader('Milan', 'Juventus');
  });

  it('a derby is one chip, and its X asks which team to unpin', async () => {
    const { alice } = await twoFriendsWithTeamPins();
    await alice.openChat('Carol Test');

    await alice.seesOneChipFor('AC Milan', 'Juventus');

    await alice.asksWhichToUnpin('AC Milan', ['AC Milan', 'Juventus']);
  });

  it('a group chat does not offer /calcio', async () => {
    const { alice } = await twoFriendsWithTeamPins();
    await alice.typeInComposer('/c');
    await alice.seesCommandOffered('calcio');

    await alice.openChat('Weekend');
    await alice.typeInComposer('/c');

    await alice.seesCommandOffered('code');
    await alice.doesNotSeeCommandOffered('calcio');
  });
});
