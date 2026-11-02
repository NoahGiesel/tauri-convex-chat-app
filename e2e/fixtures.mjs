// What a test works with: domain actions per user. Selectors and waits live here, never in a test.
import { en } from '../src/i18n/en.ts';
import { EXPIRED_INVITE_TOKEN, INTERFACE_WAIT_MS, PASSWORD, USERS } from './config.mjs';
import { reset } from './reset.mjs';
import { scriptedUser } from './scripted-user.mjs';

const WAIT = { timeout: INTERFACE_WAIT_MS, interval: 100 };
const COMPOSER = `aria/${en['chat.composer']}`;
const SETTINGS = `aria/${en['nav.settings']}`;
/** The field, because `aria/` also matches the Edit button, which has the same name. */
const EDITOR = `//textarea[@aria-label="${en['chat.editMessage']}"]`;
const MONOSPACE = /mono|consolas|courier|menlo/i;
/** The form's button, because `aria/` also matches a row's button by its visible text. */
const REDEEM_BUTTON = `//form//button[normalize-space(.)="${en['invite.add']}"]`;
const LOAD_OLDER = `aria/${en['chat.loadOlder']}`;
const JUMP_TO_LATEST = `aria/${en['chat.jumpToLatest']}`;
const textSelector = (text) => `//*[contains(normalize-space(.), "${text}") and not(*)]`;
const roleSelector = (role, text) => `//*[@role="${role}"][contains(normalize-space(.), "${text}")]`;
const named = (key, name) => en[key].replace('{name}', name);
const messageRow = (text) => `//*[@data-testid="message"][contains(normalize-space(.), "${text}")]`;
const messageButton = (text, label) => `${messageRow(text)}//button[@aria-label="${label}"]`;
/** The raw text, not `messageRow()`: `normalize-space` would hide the spaces that `/pre` keeps. */
const messageWords = (text) => `//*[@data-testid="message"]//*[text()[contains(., "${text}")]]`;
/**
 * A chat in the list, by the tooltip a person sees on it: its title, then its presence.
 * Not by `aria/`, because the row is named by its content, which also holds the unread count.
 */
const rowTooltip = (title, presence = '') => `${title} · ${presence}`;
const chatRow = (title) => `//button[starts-with(@title, "${rowTooltip(title)}")]`;
/** A friend's tick box in the new group form, by the name beside it. */
const memberChoice = (person) => `//label[.//span[normalize-space(.)="${person}"]]//input[@type="checkbox"]`;
/** What a group's row says about it: how many are in it, and how many of the others are online. */
const groupStatus = ({ members, online }) =>
  online > 0
    ? en['presence.groupOnline'].replace('{count}', members).replace('{online}', online)
    : en['chat.members'].replace('{count}', members);
const unread = (count) => en['side.unread'].replace('{count}', count);
const unreadBadge = (title, count) => `${chatRow(title)}//*[@title="${unread(count)}"]`;
/** Any count: the text that follows the number. */
const anyUnreadBadge = (title) => `${chatRow(title)}//*[contains(@title, "${unread('')}")]`;
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
  const waitUntilClickable = (selector) =>
    b.waitUntil(async () => b.$(selector).isClickable(), { ...WAIT, timeoutMsg: `${name} could not press ${selector}` });

  const press = async (selector) => {
    await waitUntilClickable(selector);
    await b.$(selector).click();
  };

  /**
   * For a button that starts a smooth scroll. The driver's click() focuses the button after clicking it,
   * and that focus stops the scroll. A pointer focuses on the way down, before the click, as a mouse does.
   */
  const pressWithPointer = async (selector) => {
    await waitUntilClickable(selector);
    await b.action('pointer').move({ origin: await b.$(selector) }).down().up().perform();
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
    /** Scrolled to where a person would see it, not only somewhere in the chat. */
    seesMessageInView: (text) =>
      b.waitUntil(async () => b.$(messageRow(text)).isDisplayed({ withinViewport: true }), {
        ...WAIT,
        timeoutMsg: `${name} did not see the message "${text}" without scrolling`,
      }),
    async doesNotSeeMessageInView(text) {
      if (await b.$(messageRow(text)).isDisplayed({ withinViewport: true })) throw new Error(`${name} still sees the message "${text}" without scrolling`);
    },
    loadOlderMessages: () => press(LOAD_OLDER),
    seesAllMessagesLoaded: () => waitUntilGone(LOAD_OLDER, `${name} can still load older messages`),
    jumpToLatest: () => pressWithPointer(JUMP_TO_LATEST),
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

    seesChatInList: (title) => waitUntilShown(chatRow(title), `${name} has no chat with ${title} in the list`),
    async hasNoChatOpen() {
      if (await b.$(COMPOSER).isExisting()) throw new Error(`${name} has a chat open`);
    },
    seesUnread: (title, count) => waitUntilShown(unreadBadge(title, count), `${name} did not see ${count} unread in ${title}`),
    seesNoUnread: (title) => waitUntilGone(anyUnreadBadge(title), `${name} still sees unread messages in ${title}`),
    seesOnline: (person) => waitUntilShown(`//button[@title="${rowTooltip(person, en['side.online'])}"]`, `${name} did not see ${person} online`),
    seesGroup: (title, counts) =>
      waitUntilShown(`//button[@title="${rowTooltip(title, groupStatus(counts))}"]`, `${name} did not see ${title} as "${groupStatus(counts)}"`),
    async createGroup(title, members) {
      await press(`aria/${en['side.createGroup']}`);
      await fill(en['group.nameLabel'], title);
      for (const person of members) await press(memberChoice(person));
      await press(`aria/${en['people.createGroup']}`);
      await user.seesChatInList(title);
      // Not the composer: the chat open before has one too. Only the new group is empty.
      await waitUntilShown(textSelector(en['chat.noMessages']), `${name} did not open ${title}`);
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

export async function twoFriends() {
  await reset('friends');
  const { alice, bob } = aliceAndBob();
  // The list proves the chats rendered, so the absence of a chat after it means something.
  await alice.seesChatInList(USERS.bob.name);
  await bob.seesChatInList(USERS.alice.name);
  await alice.hasNoChatOpen();
  await bob.hasNoChatOpen();
  return { alice, bob };
}

export async function longChat() {
  await reset('history');
  const alice = drivenUser('alice');
  await alice.openChat(USERS.bob.name);
  return { alice };
}

export async function groupChatOpen() {
  await reset('groups');
  const { alice, bob } = aliceAndBob();
  await alice.openChat('Weekend');
  await bob.openChat('Weekend');
  const carol = await scriptedUser('carol');
  return { alice, bob, carol };
}

export async function twoFriendsWithChatOpen() {
  await reset('friends');
  const { alice, bob } = aliceAndBob();
  await alice.openChat(USERS.bob.name);
  await bob.openChat(USERS.alice.name);
  return { alice, bob };
}
