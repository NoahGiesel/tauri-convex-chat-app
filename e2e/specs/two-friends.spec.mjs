import { twoFriendsWithChatOpen } from '../fixtures.mjs';

describe('two friends chatting', () => {
  it('each sees the other message', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();

    await alice.send('Hi Bob');
    await bob.sees('Hi Bob');

    await bob.send('Hi Alice');
    await alice.sees('Hi Alice');
  });

  it('starts from the Seed, whatever the last test did', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();

    await alice.sees('Seeded hello');
    await bob.sees('Seeded hello');
    await alice.doesNotSee('Hi Bob');
    await bob.doesNotSee('Hi Alice');
  });
});
