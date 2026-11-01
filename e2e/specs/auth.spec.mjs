import { signedOut } from '../fixtures.mjs';

describe('signing in and out', () => {
  it('a new person creates an account and reaches their chats', async () => {
    const { alice } = await signedOut();

    await alice.signUp({ name: 'Dana Test', email: 'dana@e2e.invalid' });

    await alice.seesChats();
    await alice.sees('Dana Test');
  });

  it('an existing person signs in', async () => {
    const { alice } = await signedOut();

    await alice.signIn();

    await alice.seesChats();
    await alice.sees('Alice Test');
  });

  it('a wrong password is refused, and the right one still works', async () => {
    const { alice } = await signedOut();

    await alice.signIn({ password: 'not-the-right-password' });
    await alice.seesSignInRefused();

    await alice.signIn();
    await alice.seesChats();
  });

  it('a session survives a reload', async () => {
    const { alice } = await signedOut();
    await alice.signIn();
    await alice.seesChats();

    await alice.reload();

    await alice.seesChats();
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

    await alice.showPassword();
    await alice.seesEveryControlNamed();

    await alice.startSignUp();
    await alice.seesEveryControlNamed();
  });
});
