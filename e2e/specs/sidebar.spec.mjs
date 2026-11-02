import { SECTION, soloWithChats } from '../fixtures.mjs';

// Alice has Weekend, and direct chats with Bob and Carol. Her chat with Carol is the newer one,
// and Carol was last online 3 days before the run.
describe('the sidebar', () => {
  it('a chat moves into a folder, and comes back out when the folder goes', async () => {
    const { alice } = await soloWithChats();
    await alice.createFolder('Close friends');

    await alice.moveChatToFolder('Bob Test', 'Close friends');
    await alice.seesChatInSection('Bob Test', 'Close friends');
    await alice.reload();
    await alice.seesChatInSection('Bob Test', 'Close friends');

    await alice.deleteFolder('Close friends');
    await alice.seesChatInSection('Bob Test', SECTION.direct);
  });

  it('a folder keeps its chats when it is renamed', async () => {
    const { alice } = await soloWithChats();
    await alice.createFolder('Plans');
    await alice.moveChatToFolder('Weekend', 'Plans');
    await alice.seesChatInSection('Weekend', 'Plans');

    await alice.renameFolder('Plans', 'Trips');

    await alice.seesChatInSection('Weekend', 'Trips');
  });

  it('the chat with the newest message comes first', async () => {
    const { alice } = await soloWithChats();
    await alice.seesChatAbove('Carol Test', 'Bob Test');

    await alice.openChat('Bob Test');
    await alice.send('Back to the top');

    await alice.seesChatAbove('Bob Test', 'Carol Test');
  });

  it('a chat dragged above another stays there', async () => {
    const { alice } = await soloWithChats();
    await alice.seesChatAbove('Carol Test', 'Bob Test');

    await alice.moveChatAbove('Bob Test', 'Carol Test');

    await alice.seesChatAbove('Bob Test', 'Carol Test');
    await alice.reload();
    await alice.seesChatAbove('Bob Test', 'Carol Test');
  });

  it('a section dragged above another stays there', async () => {
    const { alice } = await soloWithChats();
    await alice.seesSectionAbove(SECTION.groups, SECTION.direct);

    await alice.moveSectionAbove(SECTION.direct, SECTION.groups);

    await alice.seesSectionAbove(SECTION.direct, SECTION.groups);
    await alice.reload();
    await alice.seesSectionAbove(SECTION.direct, SECTION.groups);
  });

  it('search shows only the chats that match', async () => {
    const { alice } = await soloWithChats();

    await alice.searchChats('car');
    await alice.seesChatInList('Carol Test');
    await alice.stopsSeeingChatInList('Bob Test');
    await alice.stopsSeeingChatInList('Weekend');

    await alice.searchChats('nobody');
    await alice.seesNoChatsFound();
  });

  it('a friend away for days shows when they were last online', async () => {
    const { alice } = await soloWithChats();

    await alice.seesLastOnline('Carol Test', '3 days ago');
  });
});
