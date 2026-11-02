import { twoFriends } from '../fixtures.mjs';

describe('the chat list', () => {
  it('an unread badge appears live, adds up and clears when the chat is opened', async () => {
    const { alice, bob } = await twoFriends();
    await bob.openChat('Alice Test');

    await bob.send('Are you there?');
    await alice.seesUnread('Bob Test', 1);

    await bob.send('Hello?');
    await alice.seesUnread('Bob Test', 2);

    await alice.openChat('Bob Test');
    await alice.seesMessage('Hello?');
    await alice.seesNoUnread('Bob Test');
  });

  it('a friend with the app open shows as online', async () => {
    const { alice, bob } = await twoFriends();

    await alice.seesOnline('Bob Test');
    await bob.seesOnline('Alice Test');
  });

  it('a chat opens from the list', async () => {
    const { alice } = await twoFriends();
    await alice.doesNotSeeMessage('Seeded hello');

    await alice.openChat('Bob Test');

    await alice.seesMessage('Seeded hello');
  });
});
