import { twoFriendsWithChatOpen } from '../fixtures.mjs';

// GIPHY is the local stub. A search for "Happy cats" finds "Happy cats 1" to "Happy cats 3", and no search finds "Trending 1" to "Trending 3".
describe('sending a GIF', () => {
  it('a GIF picked from the trending ones reaches the friend', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();
    await alice.openGifPicker();
    await alice.seesGifInPicker('Trending 2');

    await alice.pickGif('Trending 2');

    await alice.seesGif('Trending 2');
    await bob.seesGif('Trending 2');
  });

  it('a GIF found by a search in the picker reaches the friend', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();
    await alice.openGifPicker();

    await alice.searchGifs('Happy cats');
    await alice.seesGifInPicker('Happy cats 3');
    await alice.pickGif('Happy cats 3');

    await bob.seesGif('Happy cats 3');
  });

  it('/giphy sends one of the results for its words, under the search', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();

    await alice.send('/giphy Happy cats');

    await bob.seesGifFoundBy('Happy cats');
  });
});
