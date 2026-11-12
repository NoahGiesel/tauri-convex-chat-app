import { twoFriendsWithTeamPins } from '../fixtures.mjs';
import { FINISHED_DETAILS, FINISHED_MATCH, LIVE_DETAILS } from '../stub.mjs';

// The richer Match drawer. ESPN is the local stub, and the `football` Seed holds the schedules and the tables the
// drawer reads: Inter (live), AC Milan and Juventus (the derby) in Alice's chat with Carol. The live match's
// summary has places on the pitch, one goal, and a substitute; the result a test opens has its own summary.
describe('Match drawer', () => {
  it('stays open while the chat is used, and closes only on its own controls', async () => {
    const { alice } = await twoFriendsWithTeamPins();
    await alice.openChat('Carol Test');
    await alice.seesChip('Internazionale', 'live');
    await alice.openMatch('Internazionale');

    await alice.send('Still here');
    await alice.seesMessage('Still here');
    await alice.seesDrawer();
    await alice.seesComposerFullyVisible();

    await alice.pressEscapeInComposer();
    // A message after the Esc proves the app rendered again with the drawer still there.
    await alice.send('Still here too');
    await alice.seesMessage('Still here too');
    await alice.seesDrawer();

    await alice.closeMatchWithEscape();
    await alice.stopsSeeingDrawer();

    await alice.openMatch('Internazionale');
    await alice.closeMatch();
    await alice.stopsSeeingDrawer();

    await alice.openMatch('Internazionale');
    await alice.closeMatchWithChip('Internazionale');
    await alice.stopsSeeingDrawer();
  });

  it("another chat has no drawer of this one, and coming back reopens it on the same team", async () => {
    const { alice } = await twoFriendsWithTeamPins();
    await alice.openChat('Carol Test');
    await alice.seesChip('Internazionale', 'live');
    await alice.openMatch('Internazionale');

    await alice.openChat('Dave Test');
    await alice.seesChip('Napoli', 'finished');
    await alice.hasNoDrawer();

    await alice.openChat('Carol Test');
    await alice.seesChip('Internazionale', 'live');
    await alice.seesDrawer();
    await alice.seesInDrawer(LIVE_DETAILS.venue);
  });

  it('draws both lineups on the pitch, with the goal badge and the substitute on the bench', async () => {
    const { alice } = await twoFriendsWithTeamPins();
    await alice.openChat('Carol Test');
    await alice.seesChip('Internazionale', 'live');
    await alice.openMatch('Internazionale');

    await alice.seesPitch(22);
    await alice.seesGoalOnPitch();
    await alice.seesSubstituteOnBench();
  });

  it('lists the results with W, D and L badges, and a finished row opens that match', async () => {
    const { alice } = await twoFriendsWithTeamPins();
    await alice.openChat('Carol Test');
    await alice.seesChip('Internazionale', 'live');
    await alice.openMatch('Internazionale');
    await alice.showDrawerTab('teamPins.tabMatches');

    await alice.seesMatchesTab();
    for (const [eventId, outcome] of [
      [FINISHED_MATCH.eventId, 'win'],
      ['910003', 'draw'],
      ['910002', 'loss'],
    ]) {
      await alice.seesMatchRow(eventId);
      await alice.seesResultBadge(eventId, outcome);
    }

    await alice.openFinishedMatch(FINISHED_MATCH.eventId);
    await alice.seesBackToMatch();
    await alice.seesOpenedMatchFinished();
    await alice.seesInDrawer(FINISHED_DETAILS.venue);
    await alice.seesInDrawer(FINISHED_DETAILS.scorer);

    await alice.backToMatch();
    await alice.stopsSeeingBackToMatch();
    await alice.seesPitch(22);
  });

  it('shows the league table, switches competition, and shows the cup path', async () => {
    const { alice } = await twoFriendsWithTeamPins();
    await alice.openChat('Carol Test');
    await alice.seesChip('Internazionale', 'live');
    await alice.openMatch('Internazionale');
    await alice.showDrawerTab('teamPins.tabStandings');

    await alice.seesStandingsTable();
    await alice.seesCompetitionOn('ita.1');
    await alice.seesTableRowOn('Internazionale');
    await alice.seesTableRowPinned('AC Milan');
    await alice.seesTableRowPinned('Juventus');

    // The Champions League is a table of its own: a team the league table does not hold proves the switch.
    await alice.pickCompetition('uefa.champions');
    await alice.seesCompetitionOn('uefa.champions');
    await alice.seesTableRow('Real Madrid');
    await alice.seesTableRowOn('Internazionale');

    await alice.pickCompetition('ita.coppa_italia');
    await alice.seesCompetitionOn('ita.coppa_italia');
    await alice.seesCupPath(2);
  });

  it('switches between the derby\'s two teams, on Matches and on Standings', async () => {
    const { alice } = await twoFriendsWithTeamPins();
    await alice.openChat('Carol Test');
    await alice.seesOneChipFor('AC Milan', 'Juventus');
    await alice.openMatch('AC Milan');
    await alice.showDrawerTab('teamPins.tabMatches');

    await alice.seesTeamSwitch();
    await alice.seesDrawerTeamOn('AC Milan');
    await alice.seesMatchRow('910011');

    await alice.pickDrawerTeam('Juventus');
    await alice.seesDrawerTeamOn('Juventus');
    await alice.seesMatchRow('910012');
    await alice.doesNotSeeMatchRow('910011');

    await alice.showDrawerTab('teamPins.tabStandings');
    await alice.seesTeamSwitch();
    await alice.seesDrawerTeamOn('Juventus');
    await alice.seesTableRowOn('Juventus');

    await alice.pickDrawerTeam('AC Milan');
    await alice.seesDrawerTeamOn('AC Milan');
    await alice.seesTableRowOn('AC Milan');
    await alice.seesTableRowPinned('Juventus');
  });

  it("closes Alice's open drawer when Bob removes the pin", async () => {
    const { alice, bob } = await twoFriendsWithTeamPins();
    await alice.searchTeams('inter');
    await alice.pickTeam('Internazionale');
    await bob.seesChip('Internazionale', 'live');

    await alice.openMatch('Internazionale');
    await alice.seesDrawer();

    await bob.unpin('Internazionale');

    await alice.stopsSeeingDrawer();
    await alice.seesNoChip('Internazionale');
  });
});
