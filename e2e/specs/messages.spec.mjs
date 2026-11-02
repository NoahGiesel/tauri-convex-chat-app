import { twoFriendsWithChatOpen } from '../fixtures.mjs';

describe('changing a message', () => {
  it('an edit reaches both', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();
    await alice.send('Se you soon');
    await bob.seesMessage('Se you soon');

    await alice.editMessage('Se you soon', 'See you soon');

    await alice.seesEditedMessage('See you soon');
    await bob.seesEditedMessage('See you soon');
    await alice.doesNotSeeMessage('Se you soon');
    await bob.doesNotSeeMessage('Se you soon');
  });

  it('a deletion reaches both', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();
    await alice.send('Forget this');
    await bob.seesMessage('Forget this');

    await alice.deleteMessage('Forget this');

    await alice.stopsSeeingMessage('Forget this');
    await bob.stopsSeeingMessage('Forget this');
    await bob.seesMessage('Seeded hello');
  });

  it('only the author can edit or delete a message', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();
    await alice.send('Mine alone');
    await bob.seesMessage('Mine alone');

    await alice.canChangeMessage('Mine alone');
    await bob.cannotChangeMessage('Mine alone');
  });

  it('reactions reach both, add up and come off again', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();

    await alice.reactTo('Seeded hello', '👍');
    await alice.seesReaction('Seeded hello', '👍', 1);
    await bob.seesReaction('Seeded hello', '👍', 1);

    await bob.toggleReaction('Seeded hello', '👍');
    await alice.seesReaction('Seeded hello', '👍', 2);
    await bob.seesReaction('Seeded hello', '👍', 2);

    await alice.toggleReaction('Seeded hello', '👍');
    await alice.seesReaction('Seeded hello', '👍', 1);
    await bob.seesReaction('Seeded hello', '👍', 1);

    await bob.toggleReaction('Seeded hello', '👍');
    await alice.seesNoReaction('Seeded hello', '👍');
    await bob.seesNoReaction('Seeded hello', '👍');
  });
});

describe('slash commands', () => {
  it('/me shows an action by the author', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();

    await alice.send('/me waves');

    await alice.seesAction('Alice Test', 'waves');
    await bob.seesAction('Alice Test', 'waves');
  });

  it('/code shows code', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();

    await alice.send('/code const answer = 42');

    await alice.seesCode('const answer = 42');
    await bob.seesCode('const answer = 42');
  });

  it('/pre keeps the spaces', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();

    await alice.send('/pre one   two');

    await alice.seesPreformatted('one   two');
    await bob.seesPreformatted('one   two');
  });

  it('/spoiler hides the text', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();

    await alice.send('/spoiler The butler did it');

    await alice.seesSpoiler('The butler did it');
    await bob.seesSpoiler('The butler did it');
  });

  it('/quote shows a quotation', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();

    await alice.send('/quote Well said');

    await alice.seesQuote('Well said');
    await bob.seesQuote('Well said');
  });

  it('/random rolls a number in the range, the same for both', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();

    await alice.send('/random 1-6');

    const rolled = await alice.seesRollWithin(1, 6);
    await bob.seesRoll(rolled, 1, 6);
  });

  it('/random on its own rolls from 1 to 100', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();

    await alice.sendCompleted('/random');

    const rolled = await alice.seesRollWithin(1, 100);
    await bob.seesRoll(rolled, 1, 100);
  });

  it('/flip lands on one side, the same for both', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();

    await alice.sendCompleted('/flip');

    const side = await alice.seesFlip();
    await bob.seesCoinOn(side);
  });
});
