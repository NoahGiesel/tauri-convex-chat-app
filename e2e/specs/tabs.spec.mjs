import { soloWithChats } from '../fixtures.mjs';

// Alice's chat with Bob holds "Seeded hello", and Weekend holds "Seeded group hello".
describe('tabs', () => {
  it('each chat opened gets a tab, and a tab shows its chat again', async () => {
    const { alice } = await soloWithChats();
    await alice.openChat('Weekend');
    await alice.openChat('Bob Test');
    await alice.seesTab('Weekend');
    await alice.seesTab('Bob Test');
    await alice.seesMessage('Seeded hello');

    await alice.showTab('Weekend');

    await alice.seesMessage('Seeded group hello');
  });

  it('closing the tab shown brings back the one before it', async () => {
    const { alice } = await soloWithChats();
    await alice.openChat('Weekend');
    await alice.openChat('Bob Test');

    await alice.closeTab('Bob Test');

    await alice.stopsSeeingTab('Bob Test');
    await alice.seesMessage('Seeded group hello');
  });

  it('a tab in the background closes too', async () => {
    const { alice } = await soloWithChats();
    await alice.openChat('Weekend');
    await alice.openChat('Bob Test');

    await alice.closeBackgroundTab('Weekend');

    await alice.stopsSeeingTab('Weekend');
    await alice.seesMessage('Seeded hello');
  });
});

describe('split view', () => {
  it('a tab dropped on the right shows its chat beside the open one', async () => {
    const { alice } = await soloWithChats();
    await alice.openChat('Weekend');
    await alice.openChat('Bob Test');

    await alice.splitView('Weekend', 'right');

    await alice.seesSideBySide('Seeded hello', 'Seeded group hello');
  });

  it('a tab dropped on the left goes to the left, and closing it ends the split', async () => {
    const { alice } = await soloWithChats();
    await alice.openChat('Weekend');
    await alice.openChat('Bob Test');
    await alice.splitView('Weekend', 'left');
    await alice.seesSideBySide('Seeded group hello', 'Seeded hello');

    await alice.closeTab('Weekend');

    await alice.seesOneChatAtATime();
    await alice.seesMessage('Seeded hello');
  });
});

describe('a popout', () => {
  it('a tab dragged out of the window opens its chat there, signed in', async () => {
    const { alice } = await soloWithChats();
    await alice.openChat('Weekend');

    await alice.popOut('Weekend');
    await alice.seesMessage('Seeded group hello');
    await alice.send('Sent from the popout');
    await alice.seesMessage('Sent from the popout');

    await alice.returnToMainWindow();
    await alice.stopsSeeingTab('Weekend');
    await alice.openChat('Weekend');
    await alice.seesMessage('Sent from the popout');
  });

  it('a Reset closes a popout left open', async () => {
    const { alice } = await soloWithChats();
    await alice.openChat('Weekend');
    await alice.popOut('Weekend');

    const after = await soloWithChats();

    await after.alice.seesOnlyMainWindow();
    await after.alice.openChat('Weekend');
    await after.alice.popOut('Weekend');
    await after.alice.seesMessage('Seeded group hello');
  });
});
