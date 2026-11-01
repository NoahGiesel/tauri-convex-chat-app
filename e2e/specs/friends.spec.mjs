import { expiredInviteLink, strangers } from '../fixtures.mjs';

describe('finding friends', () => {
  it('search finds a person by name or by whole email, and never by part of an email', async () => {
    const { alice } = await strangers();
    await alice.openFriends();

    await alice.search('bob');
    await alice.seesCanAdd('Bob Test');
    await alice.stopsSeeing('Carol Test');

    await alice.search('bob@e2e.invalid');
    await alice.seesCanAdd('Bob Test');

    await alice.search('bob@e2e');
    await alice.seesNoOneFound();
  });

  it('a friend request is accepted, and the two can talk', async () => {
    const { alice, bob } = await strangers();
    await alice.openFriends();
    await bob.openFriends();

    await alice.addFriend('Bob Test');
    await alice.seesRequestSent();
    await alice.seesRequestTo('Bob Test');

    await bob.acceptRequestFrom('Alice Test');
    await alice.seesFriend('Bob Test');

    await alice.closeFriends();
    await alice.openChat('Bob Test');
    await alice.send('Now we are friends');
    await bob.sees('Now we are friends');
  });

  it('a declined request is gone for both', async () => {
    const { alice, bob } = await strangers();
    await alice.openFriends();
    await bob.openFriends();
    await alice.addFriend('Bob Test');
    await bob.seesRequestFrom('Alice Test');

    await bob.declineRequestFrom('Alice Test');

    await alice.seesCanAdd('Bob Test');
    await bob.seesCanAdd('Alice Test');
  });

  it('a cancelled request is gone for both', async () => {
    const { alice, bob } = await strangers();
    await alice.openFriends();
    await bob.openFriends();
    await alice.addFriend('Bob Test');
    await bob.seesRequestFrom('Alice Test');

    await alice.cancelRequestTo('Bob Test');

    await alice.seesCanAdd('Bob Test');
    await bob.seesCanAdd('Alice Test');
  });

  it('adding someone who just added you makes you friends', async () => {
    const { alice, bob } = await strangers();
    await alice.openFriends();
    await bob.openFriends();
    await bob.seesCanAdd('Alice Test');

    await alice.addFriend('Bob Test');
    await bob.acceptInSearch('Alice Test');

    await bob.seesNowFriends();
    await alice.seesFriend('Bob Test');
    await bob.seesFriend('Alice Test');
  });

  it('a removed friend is gone for both', async () => {
    const { alice, bob } = await strangers();
    await alice.openFriends();
    await bob.openFriends();
    await alice.addFriend('Bob Test');
    await bob.acceptRequestFrom('Alice Test');
    await alice.seesFriend('Bob Test');

    await alice.removeFriend('Bob Test');

    await alice.seesCanAdd('Bob Test');
    await bob.openFriends();
    await bob.seesCanAdd('Alice Test');
  });

  it('every control on the friend screens has a name', async () => {
    const { alice, bob } = await strangers();
    await alice.openFriends();
    await bob.openFriends();
    await alice.seesEveryControlNamed();

    await alice.addFriend('Bob Test');
    await alice.seesRequestTo('Bob Test');
    await alice.seesEveryControlNamed();
    await bob.seesRequestFrom('Alice Test');
    await bob.seesEveryControlNamed();

    await bob.acceptRequestFrom('Alice Test');
    await alice.seesFriend('Bob Test');
    await alice.createInviteLink();
    await alice.seesEveryControlNamed();
  });
});

describe('invite links', () => {
  it('an invite link sends a request', async () => {
    const { alice, bob } = await strangers();
    await alice.openFriends();
    await bob.openFriends();
    const link = await alice.createInviteLink();

    await bob.useInvite(link);
    await bob.seesRequestSent();

    await alice.acceptRequestFrom('Bob Test');
    await bob.seesFriend('Alice Test');
  });

  it('your own invite is refused', async () => {
    const { alice } = await strangers();
    await alice.openFriends();
    const link = await alice.createInviteLink();

    await alice.useInvite(link);

    await alice.seesOwnInviteRefused();
  });

  it('a used invite is refused', async () => {
    const { alice, bob } = await strangers();
    await alice.openFriends();
    await bob.openFriends();
    const link = await alice.createInviteLink();
    await bob.useInvite(link);
    await bob.seesRequestSent();

    await bob.useInvite(link);

    await bob.seesInviteRefused();
  });

  it('an expired invite is refused', async () => {
    const { bob, link } = await expiredInviteLink();
    await bob.openFriends();

    await bob.useInvite(link);

    await bob.seesInviteRefused();
    await bob.seesCanAdd('Alice Test');
  });
});
