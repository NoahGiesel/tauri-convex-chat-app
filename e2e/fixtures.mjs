// What a test works with: domain actions per user. Selectors and waits live here, never in a test.
import { en } from '../src/i18n/en.ts';
import { EXPIRED_INVITE_TOKEN, INTERFACE_WAIT_MS, PASSWORD, USERS } from './config.mjs';
import { reset } from './reset.mjs';

const WAIT = { timeout: INTERFACE_WAIT_MS, interval: 100 };
const COMPOSER = `aria/${en['chat.composer']}`;
const SETTINGS = `aria/${en['nav.settings']}`;
/** The form's button, because `aria/` also matches a row's button by its visible text. */
const REDEEM_BUTTON = `//form//button[normalize-space(.)="${en['invite.add']}"]`;
const textSelector = (text) => `//*[contains(normalize-space(.), "${text}") and not(*)]`;
const roleSelector = (role, text) => `//*[@role="${role}"][contains(normalize-space(.), "${text}")]`;
const named = (key, name) => en[key].replace('{name}', name);

/** Runs in the page. What a screen reader would have nothing to say for, among the controls a person can reach. */
function unnamedControls() {
  // A field's content is its value, or a select's options, and neither one names it.
  const isField = (control) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName);
  const nameOf = (control) =>
    control.getAttribute('aria-label') ||
    [...(control.labels ?? [])].map((label) => label.textContent).join('') ||
    (isField(control) ? '' : control.textContent) ||
    control.title;
  return [...document.querySelectorAll('button, a[href], input, select, textarea')]
    .filter((control) => control.getClientRects().length > 0 && !nameOf(control).trim())
    .map((control) => control.outerHTML.slice(0, 120));
}

function drivenUser(name) {
  const b = browser.getInstance(name);
  /** Looks the element up on every poll: a message row gets replaced, and a held element then never reads as displayed. */
  const waitUntilShown = (selector, timeoutMsg) => b.waitUntil(async () => b.$(selector).isDisplayed(), { ...WAIT, timeoutMsg });

  /** The driver's click() also presses covered and hidden buttons, so a click must first prove a person could do it. */
  const press = async (selector) => {
    await b.waitUntil(async () => b.$(selector).isClickable(), { ...WAIT, timeoutMsg: `${name} could not press ${selector}` });
    await b.$(selector).click();
  };

  const fill = async (label, value) => {
    await waitUntilShown(`aria/${label}`, `${name} has no field called ${label}`);
    await b.$(`aria/${label}`).setValue(value);
  };

  const user = {
    async openChat(title) {
      await press(`aria/${title}`);
      await waitUntilShown(COMPOSER, `${name} has no composer in the chat with ${title}`);
    },
    async send(text) {
      await b.$(COMPOSER).setValue(text);
      await b.keys('Enter');
    },
    sees: (text) => waitUntilShown(textSelector(text), `${name} did not see "${text}"`),
    async doesNotSee(text) {
      if (await b.$(textSelector(text)).isExisting()) throw new Error(`${name} still sees "${text}"`);
    },

    seesAuthScreen: () => waitUntilShown(textSelector(en['auth.welcomeBack']), `${name} is not on the auth screen`),
    seesChats: () => waitUntilShown(SETTINGS, `${name} did not reach their chats`),
    seesSignInRefused: () => waitUntilShown(roleSelector('alert', en['error.generic']), `${name} was not refused`),
    async seesEveryControlNamed() {
      const unnamed = await b.execute(unnamedControls);
      if (unnamed.length) throw new Error(`${name} sees controls with no name:\n${unnamed.join('\n')}`);
    },

    async showPassword() {
      await press(`aria/${en['auth.showPassword']}`);
      await waitUntilShown(`aria/${en['auth.hidePassword']}`, `${name} has no way to hide the password`);
    },
    async startSignUp() {
      await press(`aria/${en['auth.registerLink']}`);
      await waitUntilShown(textSelector(en['auth.createTitle']), `${name} did not reach the sign-up form`);
    },
    async signUp({ name: fullName, email }) {
      await user.startSignUp();
      await fill(en['auth.name'], fullName);
      await fill(en['auth.email'], email);
      await fill(en['auth.password'], PASSWORD);
      await press(`aria/${en['auth.signUp']}`);
    },
    async signIn({ password = PASSWORD } = {}) {
      await fill(en['auth.email'], USERS[name].email);
      await fill(en['auth.password'], password);
      await press(`aria/${en['auth.signIn']}`);
    },
    async signOut() {
      await press(SETTINGS);
      await press(`aria/${en['common.signOut']}`);
    },
    async openFriends() {
      await press(`aria/${en['side.addFriend']}`);
      await waitUntilShown(`aria/${en['invite.title']}`, `${name} did not open the friends screen`);
    },
    closeFriends: () => press(`aria/${en['invite.close']}`),
    search: (text) => fill(en['invite.searchLabel'], text),
    seesNoOneFound: () => waitUntilShown(textSelector(en['invite.noUsers']), `${name} was shown someone`),
    seesCanAdd: (person) => waitUntilShown(`aria/${named('people.addPerson', person)}`, `${name} cannot add ${person}`),
    seesRequestTo: (person) => waitUntilShown(`aria/${named('people.cancelRequestTo', person)}`, `${name} has no request to ${person}`),
    seesRequestFrom: (person) => waitUntilShown(`aria/${named('people.declineRequest', person)}`, `${name} has no request from ${person}`),
    /** The second Accept exists only once the search list and the list of requests both show this person. */
    seesAcceptInBothLists: (person) =>
      waitUntilShown(`(//button[@aria-label="${named('people.acceptRequest', person)}"])[2]`, `${name} has no Accept for ${person} in both lists`),
    seesFriend: (person) => waitUntilShown(`aria/${named('people.removePerson', person)}`, `${name} is not friends with ${person}`),
    seesRequestSent: () => waitUntilShown(roleSelector('status', en['people.redeemRequested']), `${name} was not told the request went`),
    seesNowFriends: () => waitUntilShown(roleSelector('status', en['people.redeemAccepted']), `${name} was not told they are friends`),
    seesInviteRefused: () => waitUntilShown(roleSelector('alert', en['error.invalid_invite']), `${name} was not refused`),
    seesOwnInviteRefused: () => waitUntilShown(roleSelector('alert', en['error.own_invite']), `${name} was not refused`),

    addFriend: (person) => press(`aria/${named('people.addPerson', person)}`),
    /** The search list comes first, and offers the same button as the list of requests. */
    acceptInSearch: (person) => press(`(//button[@aria-label="${named('people.acceptRequest', person)}"])[1]`),
    async acceptRequestFrom(person) {
      await press(`(//button[@aria-label="${named('people.acceptRequest', person)}"])[last()]`);
      await waitUntilShown(COMPOSER, `${name} has no chat with ${person}`);
    },
    declineRequestFrom: (person) => press(`aria/${named('people.declineRequest', person)}`),
    cancelRequestTo: (person) => press(`aria/${named('people.cancelRequestTo', person)}`),
    removeFriend: (person) => press(`aria/${named('people.removePerson', person)}`),
    async createInviteLink() {
      await press(`aria/${en['invite.createLink']}`);
      await waitUntilShown(`aria/${en['invite.yourLink']}`, `${name} has no invite link`);
      return b.$(`aria/${en['invite.yourLink']}`).getValue();
    },
    async useInvite(link) {
      await fill(en['invite.gotLink'], link);
      await press(REDEEM_BUTTON);
    },

    /** `refresh()` returns before the reload ends, so a wait right after it can still read the old page. */
    async reload() {
      await b.execute(() => {
        window.notReloadedYet = true;
      });
      await b.refresh();
      await b.waitUntil(async () => b.execute(() => !window.notReloadedYet && document.readyState === 'complete'), {
        ...WAIT,
        timeoutMsg: `${name} did not reload`,
      });
    },
  };
  return user;
}

const aliceAndBob = () => ({ alice: drivenUser('alice'), bob: drivenUser('bob') });

export async function signedOut() {
  await reset('base', { signedIn: false });
  const { alice, bob } = aliceAndBob();
  await alice.seesAuthScreen();
  await bob.seesAuthScreen();
  return { alice, bob };
}

export async function strangers() {
  await reset('base');
  const { alice, bob } = aliceAndBob();
  await alice.seesChats();
  await bob.seesChats();
  return { alice, bob };
}

export async function expiredInviteLink() {
  await reset('expired-invite');
  const bob = drivenUser('bob');
  await bob.seesChats();
  return { bob, link: `chat://invite/${EXPIRED_INVITE_TOKEN}` };
}

export async function twoFriendsWithChatOpen() {
  await reset('friends');
  const { alice, bob } = aliceAndBob();
  await alice.openChat(USERS.bob.name);
  await bob.openChat(USERS.alice.name);
  return { alice, bob };
}
