// What a test works with: domain actions per user. Selectors and waits live here, never in a test.
import { en } from '../src/i18n/en.ts';
import { EXPIRED_INVITE_TOKEN, INTERFACE_WAIT_MS, PASSWORD, USERS } from './config.mjs';
import { reset } from './reset.mjs';

const WAIT = { timeout: INTERFACE_WAIT_MS, interval: 100 };
const COMPOSER = `aria/${en['chat.composer']}`;
const SETTINGS = `aria/${en['nav.settings']}`;
/** The form's button, because `aria/` also matches a row's button by its visible text. */
const EDITOR = `//textarea[@aria-label="${en['chat.editMessage']}"]`;
const MONOSPACE = /mono|consolas|courier|menlo/i;
const REDEEM_BUTTON = `//form//button[normalize-space(.)="${en['invite.add']}"]`;
const textSelector = (text) => `//*[contains(normalize-space(.), "${text}") and not(*)]`;
const roleSelector = (role, text) => `//*[@role="${role}"][contains(normalize-space(.), "${text}")]`;
const named = (key, name) => en[key].replace('{name}', name);
const messageRow = (text) => `//*[@data-testid="message"][contains(normalize-space(.), "${text}")]`;
const messageButton = (text, label) => `${messageRow(text)}//button[@aria-label="${label}"]`;
const messageWords = (text) => `${messageRow(text)}//*[text()[contains(., "${text}")]]`;
const reactionChip = (text, emoji) => `${messageRow(text)}//button[@aria-pressed][contains(normalize-space(.), "${emoji}")]`;

/** Runs in the page. What a person can see of how some words are set. */
function lookOf(element) {
  const { color, fontFamily, fontStyle, whiteSpace } = getComputedStyle(element);
  return { color, fontFamily, fontStyle, tag: element.tagName, whiteSpace };
}

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

  /** For actions shown only on hover, which cannot be driven. If this one stops being hidden, it moves to `press()`. */
  const pressHoverOnly = async (selector) => {
    await b.waitUntil(async () => b.$(selector).isExisting(), { ...WAIT, timeoutMsg: `${name} has no ${selector}` });
    if (await b.$(selector).isDisplayed()) throw new Error(`${selector} is not hover-only any more, so use press()`);
    await b.$(selector).click();
  };

  const waitUntilGone = (selector, timeoutMsg) => b.waitUntil(async () => !(await b.$(selector).isExisting()), { ...WAIT, timeoutMsg });

  const waitUntilLooks = (text, looksRight, description) =>
    b.waitUntil(
      async () => {
        const words = await b.$(messageWords(text));
        return (await words.isExisting()) && looksRight(await b.execute(lookOf, words));
      },
      { ...WAIT, timeoutMsg: `${name} did not see "${text}" as ${description}` },
    );

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
    /** Presses Enter twice: a bare command is first completed, and only then sent. */
    async sendCompleted(command) {
      await b.$(COMPOSER).setValue(command);
      await b.keys('Enter');
      await b.waitUntil(async () => (await b.$(COMPOSER).getValue()) === `${command} `, {
        ...WAIT,
        timeoutMsg: `${name} could not complete ${command}`,
      });
      await b.keys('Enter');
    },
    sees: (text) => waitUntilShown(textSelector(text), `${name} did not see "${text}"`),
    async doesNotSee(text) {
      if (await b.$(textSelector(text)).isExisting()) throw new Error(`${name} still sees "${text}"`);
    },

    seesMessage: (text) => waitUntilShown(messageRow(text), `${name} did not see the message "${text}"`),
    async doesNotSeeMessage(text) {
      if (await b.$(messageRow(text)).isExisting()) throw new Error(`${name} still sees the message "${text}"`);
    },
    stopsSeeingMessage: (text) => waitUntilGone(messageRow(text), `${name} still sees the message "${text}"`),
    seesEditedMessage: (text) =>
      waitUntilShown(`${messageRow(text)}[contains(., "${en['chat.edited']}")]`, `${name} did not see "${text}" marked as edited`),
    async editMessage(text, edited) {
      await pressHoverOnly(messageButton(text, en['chat.editMessage']));
      await waitUntilShown(EDITOR, `${name} has no editor for "${text}"`);
      await b.$(EDITOR).setValue(edited);
      await b.keys('Enter');
    },
    async deleteMessage(text) {
      await pressHoverOnly(messageButton(text, en['chat.deleteMessage']));
      await press(`${messageRow(text)}//button[normalize-space(.)="${en['chat.deleteConfirm']}"]`);
    },
    async canChangeMessage(text) {
      for (const label of [en['chat.editMessage'], en['chat.deleteMessage']]) {
        await b.waitUntil(async () => b.$(messageButton(text, label)).isExisting(), { ...WAIT, timeoutMsg: `${name} has no ${label} on "${text}"` });
      }
    },
    async cannotChangeMessage(text) {
      await user.seesMessage(text);
      for (const label of [en['chat.editMessage'], en['chat.deleteMessage']]) {
        if (await b.$(messageButton(text, label)).isExisting()) throw new Error(`${name} has ${label} on "${text}"`);
      }
    },

    reactTo: (text, emoji) => pressHoverOnly(messageButton(text, emoji)),
    toggleReaction: (text, emoji) => press(reactionChip(text, emoji)),
    seesReaction: (text, emoji, count) =>
      waitUntilShown(`${reactionChip(text, emoji)}[normalize-space(.)="${emoji}${count}"]`, `${name} did not see ${count} ${emoji} on "${text}"`),
    seesNoReaction: (text, emoji) => waitUntilGone(reactionChip(text, emoji), `${name} still sees ${emoji} on "${text}"`),

    async seesAction(author, text) {
      await waitUntilShown(messageRow(`✱ ${author} ${text}`), `${name} did not see ${author}'s action "${text}"`);
      await waitUntilLooks(text, ({ fontStyle }) => fontStyle === 'italic', 'an action');
    },
    seesCode: (text) => waitUntilLooks(text, ({ fontFamily }) => MONOSPACE.test(fontFamily), 'code'),
    seesPreformatted: (text) =>
      waitUntilLooks(text, ({ fontFamily, whiteSpace }) => MONOSPACE.test(fontFamily) && whiteSpace === 'pre', 'preformatted text'),
    seesSpoiler: (text) => waitUntilLooks(text, ({ color }) => color === 'rgba(0, 0, 0, 0)', 'a hidden spoiler'),
    seesQuote: (text) => waitUntilLooks(text, ({ tag }) => tag === 'BLOCKQUOTE', 'a quotation'),
    async seesRollWithin(min, max) {
      const roll = messageRow(`(${min}–${max})`);
      await waitUntilShown(roll, `${name} did not see a roll from ${min} to ${max}`);
      const rolled = Number(/🎲\s*(-?\d+)/.exec(await b.$(roll).getText())?.[1]);
      if (!(Number.isInteger(rolled) && rolled >= min && rolled <= max)) throw new Error(`${name} saw ${rolled} for a roll from ${min} to ${max}`);
      return rolled;
    },
    seesRoll: (rolled, min, max) => waitUntilShown(messageRow(`🎲 ${rolled}(${min}–${max})`), `${name} did not see the roll ${rolled}`),
    async seesFlip() {
      const coin = messageRow('🪙');
      await waitUntilShown(coin, `${name} did not see a coin`);
      const text = await b.$(coin).getText();
      const landed = [en['chat.flipHeads'], en['chat.flipTails']].find((word) => text.includes(word));
      if (!landed) throw new Error(`${name} saw a coin on neither side: "${text}"`);
      return landed;
    },
    seesCoinOn: (side) => waitUntilShown(messageRow(`🪙 ${side}`), `${name} did not see the coin on ${side}`),

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
