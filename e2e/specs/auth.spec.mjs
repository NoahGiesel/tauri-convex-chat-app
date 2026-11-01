import { signedOut } from '../fixtures.mjs';

describe('signing in and out', () => {
  it('a new person creates an account and reaches their chats', async () => {
    const { alice } = await signedOut();

    await alice.signUp({ name: 'Dana Test', email: 'dana@e2e.invalid' });

    await alice.seesChats();
    await alice.sees('Dana Test');
  });

  it('an existing person signs in', async () => {
    const { bob } = await signedOut();

    await bob.signIn();

    await bob.seesChats();
    await bob.sees('Bob Test');
  });

  it('a wrong password is refused', async () => {
    const { alice } = await signedOut();

    await alice.signIn({ password: 'not-the-right-password' });

    await alice.seesRefusal('Something went wrong. Please try again.');
    await alice.seesAuthScreen();
  });

  it('a session survives a reload', async () => {
    const { alice } = await signedOut();
    await alice.signIn();
    await alice.seesChats();

    await alice.reload();

    await alice.seesChats();
    await alice.doesNotSee('Welcome back');
  });

  it('signing out ends the session, even after a reload', async () => {
    const { alice } = await signedOut();
    await alice.signIn();
    await alice.seesChats();

    await alice.signOut();
    await alice.seesAuthScreen();

    await alice.reload();
    await alice.seesAuthScreen();
  });

  it('every control on the auth screen has a name', async () => {
    const { alice } = await signedOut();

    await alice.seesEveryControlNamed();

    await alice.startSignUp();
    await alice.seesEveryControlNamed();
  });
});
