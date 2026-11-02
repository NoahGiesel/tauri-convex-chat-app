import { longChat } from '../fixtures.mjs';

// The chat holds "Seeded hello", then "History 01" to "History 70". A page is 30 messages.
describe('a long chat', () => {
  it('older messages load a page at a time', async () => {
    const { alice } = await longChat();
    await alice.seesMessageInView('History 70');
    await alice.seesMessage('History 41');
    await alice.doesNotSeeMessage('History 40');

    await alice.loadOlderMessages();
    await alice.seesMessage('History 11');
    await alice.doesNotSeeMessage('History 10');

    await alice.loadOlderMessages();
    await alice.seesMessage('Seeded hello');
    await alice.seesAllMessagesLoaded();
  });

  it('jump to latest brings back the newest message', async () => {
    const { alice } = await longChat();
    await alice.loadOlderMessages();
    await alice.seesMessage('History 11');
    await alice.doesNotSeeMessageInView('History 70');

    await alice.jumpToLatest();

    await alice.seesMessageInView('History 70');
  });
});
