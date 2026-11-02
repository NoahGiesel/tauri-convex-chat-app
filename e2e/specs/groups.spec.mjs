import { groupChatOpen } from '../fixtures.mjs';

// Weekend holds Alice, Bob and Carol. Carol is a Scripted user, last online 3 days before the run.
describe('a group chat', () => {
  it('messages reach all three', async () => {
    const { alice, bob, carol } = await groupChatOpen();

    await alice.send('Hi all');
    await bob.seesMessage('Hi all');
    await carol.seesMessage('Weekend', 'Hi all');

    await bob.send('Bob too');
    await alice.seesMessage('Bob too');
    await carol.seesMessage('Weekend', 'Bob too');

    await carol.send('Weekend', 'Carol here');
    await alice.seesMessage('Carol here');
    await bob.seesMessage('Carol here');
  });

  it('a new group reaches the friends in it, and only them', async () => {
    const { alice, bob, carol } = await groupChatOpen();

    await alice.createGroup('Road trip', ['Bob Test']);
    await alice.send('Who drives?');

    await bob.seesGroup('Road trip', { members: 2, online: 1 });
    await bob.openChat('Road trip');
    await bob.seesMessage('Who drives?');
    await carol.seesChat('Weekend');
    await carol.hasNoChat('Road trip');
  });

  it('Weekend has its three members', async () => {
    const { alice, bob, carol } = await groupChatOpen();

    await alice.seesGroup('Weekend', { members: 3, online: 1 });
    await bob.seesGroup('Weekend', { members: 3, online: 1 });
    await carol.seesMembers('Weekend', ['Alice Test', 'Bob Test', 'Carol Test']);
  });

  it('the online count rises when Carol comes online', async () => {
    const { alice, bob, carol } = await groupChatOpen();
    await alice.seesGroup('Weekend', { members: 3, online: 1 });

    await carol.comesOnline();

    await alice.seesGroup('Weekend', { members: 3, online: 2 });
    await bob.seesGroup('Weekend', { members: 3, online: 2 });
  });
});
