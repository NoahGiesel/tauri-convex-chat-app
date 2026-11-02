// What a test works with: domain actions per user. Selectors and waits live here, never in a test.
import fs from 'node:fs';
import path from 'node:path';
import { en } from '../src/i18n/en.ts';
import { E2E_DIR, EXPIRED_INVITE_TOKEN, INTERFACE_WAIT_MS, MAIN_WINDOW, PASSWORD, POLL_MS, USERS } from './config.mjs';
import { reset } from './reset.mjs';
import { scriptedUser } from './scripted-user.mjs';
import { gifAddress, gifTitles } from './stub.mjs';

const WAIT = { timeout: INTERFACE_WAIT_MS, interval: POLL_MS };
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
/** A chat in the list, with exactly this presence in its tooltip. */
const chatRowWith = (title, presence) => `//button[@title="${rowTooltip(title, presence)}"]`;
/** A friend's tick box in the new group form, by the name beside it. Not `aria/`, which also matches the friend's chat row. */
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
const lastOnline = (time) => en['presence.lastOnline'].replace('{time}', time);
/** The sections of the chat list that every person has. Folders are named by the person. */
export const SECTION = { groups: en['side.groups'], direct: en['side.direct'] };
const FOLDER_NAME = `aria/${en['side.folderName']}`;
/** The button that opens and closes a section, by the name on it. */
const sectionToggle = (title) => `button[@aria-expanded][.//span[normalize-space(.)="${title}"]]`;
const section = (title) => `//section[div/${sectionToggle(title)}]`;
/** What a person drags to move a section: its heading, which holds the toggle. */
const sectionHeading = (title) => `//div[@draggable][${sectionToggle(title)}]`;
const folderControl = (folder, label) => `${section(folder)}/div//button[@aria-label="${label}"]`;
/** An open chat's tab, by its close button, which is named after the chat. */
const tabClose = (title) => `//button[@aria-label="${named('tabs.close', title)}"]`;
const tab = (title) => `//div[@draggable="true"][.${tabClose(title)}]`;
/** Where a dragged tab drops to split the view. They show only during a drag, on the one chat shown. */
const tabDrop = (side) => `//*[@data-testid="tab-drop-${side}"]`;
const secondComposer = `(//textarea[@aria-label="${en['chat.composer']}"])[2]`;
const ATTACH_INPUT = '//input[@data-testid="attach-input"]';
const REMOVE_STAGED = `//button[@aria-label="${en['composer.removeAttachment']}"]`;
/** A file waiting in the composer, by its name: a photo's description, or the text under a video. */
const staged = (file) => `//div[button[@aria-label="${en['composer.removeAttachment']}"]][img[@alt="${file}"] or .//span[normalize-space(.)="${file}"]]`;
/** The composer's GIF button has no translated name, so it is found by "GIF" and by opening a picker. */
const GIF_BUTTON = '//button[@aria-label="GIF"][@aria-expanded]';
const GIF_SEARCH = `//input[@placeholder="${en['composer.gifSearch']}"]`;
/** A result in the picker is a button titled like the GIF. */
const gifResult = (title) => `//button[@title="${title}"]`;
/** A GIF in a message, at any of these addresses. */
const gifAt = (addresses) => `//img[@alt="${en['chat.gifAlt']}"][${addresses.map((address) => `@src="${address}"`).join(' or ')}]`;

/** By the name before the extension: a photo is sent re-encoded, and may come back as a .webp. */
const photo = (name) => `//img[starts-with(@alt, "${name}.")]`;
const sentPhoto = (name) => `//*[@data-testid="message"]${photo(name)}`;
const ASSETS = path.join(E2E_DIR, 'assets');
const TYPES = { '.png': 'image/png', '.mp4': 'video/mp4', '.txt': 'text/plain' };
/** A file from `e2e/assets`, ready to hand to the page, under its own name or another. */
const asset = (file, name = file) => ({ name, type: TYPES[path.extname(file)], base64: fs.readFileSync(path.join(ASSETS, file)).toString('base64') });

/** The second element comes after the first in the page: lower down, or to the right of it in a row. */
const followedBy = (first, then) => `${first}/following::${then.replace(/^\/\//, '')}`;

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

/**
 * Runs in the page. One event of a drag, at the top, middle or bottom of the element, sharing one DataTransfer
 * from `dragstart` on. Then two frames, so React has rendered what the event changed before the next one reads it.
 */
async function fireDragEvent(element, type, at) {
  if (type === 'dragstart') window.e2eDataTransfer = new DataTransfer();
  const rect = element.getBoundingClientRect();
  const centreX = rect.left + rect.width / 2;
  const [clientX, clientY] = {
    top: [centreX, rect.top + 2],
    middle: [centreX, rect.top + rect.height / 2],
    bottom: [centreX, rect.bottom - 2],
    outside: [-50, -50],
  }[at];
  const init = { bubbles: true, cancelable: true, clientX, clientY, dataTransfer: window.e2eDataTransfer };
  element.dispatchEvent(new DragEvent(type, init));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

/**
 * Runs in the page. Brings this window to the front, as a person's click would. Chromium fires no focus or blur
 * events in a window in the background, so a field there opens with no text chosen and Enter cannot leave it.
 */
async function bringWindowToFront() {
  if (document.hasFocus()) return;
  const { label } = window.__TAURI_INTERNALS__.metadata.currentWindow;
  await window.__TAURI_INTERNALS__.invoke('plugin:window|set_focus', { label });
}

/**
 * Runs in the page. The driver refuses to type into a file input, so this gives it files as a picker would,
 * then fires `change`. The app then runs its real upload.
 */
function chooseFiles(input, files) {
  const dataTransfer = new DataTransfer();
  for (const { name, type, base64 } of files) {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    dataTransfer.items.add(new File([bytes], name, { type }));
  }
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Runs in the page. Whether an image has really loaded, not only been placed. */
const hasLoaded = (img) => img.complete && img.naturalWidth > 0;
/** Runs in the page. Whether a player has read the video's metadata, so it could play it. */
const hasMetadata = (video) => video.readyState >= HTMLMediaElement.HAVE_METADATA && video.duration > 0;

/** Runs in the page. What the page sees as the pointer leaves the window during a drag. */
function leaveWindowDragging() {
  document.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: null, dataTransfer: window.e2eDataTransfer }));
}

function drivenUser(name) {
  const b = browser.getInstance(name);
  /** Looks the element up on every poll: a message row gets replaced, and a held element then never reads as displayed. */
  const waitUntilShown = (selector, timeoutMsg) => b.waitUntil(async () => b.$(selector).isDisplayed(), { ...WAIT, timeoutMsg });

  /** The driver's click() also presses covered and hidden buttons, so a click must first prove a person could do it. */
  const waitUntilClickable = (selector) =>
    b.waitUntil(async () => b.$(selector).isClickable(), { ...WAIT, timeoutMsg: `${name} could not press ${selector}` });

  /**
   * Only for what needs focus events, because Windows lets a window take the front only while no other app is in use.
   * The two instances take turns in front, and only the one in front gets focus events.
   */
  const bringToFront = async () => {
    await b.execute(bringWindowToFront);
    await b.waitUntil(() => b.execute(() => document.hasFocus()), {
      ...WAIT,
      timeoutMsg: `${name} did not come to the front, which this step needs. Another app in use, or a locked screen, stops it`,
    });
  };

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

  const waitUntilExists = (selector, timeoutMsg) => b.waitUntil(async () => b.$(selector).isExisting(), { ...WAIT, timeoutMsg });

  /** For actions shown only on hover, which cannot be driven. If this one stops being hidden, it moves to `press()`. */
  const pressHoverOnly = async (selector) => {
    await waitUntilExists(selector, `${name} has no ${selector}`);
    if (await b.$(selector).isDisplayed()) throw new Error(`${selector} is not hover-only any more, so use press()`);
    await b.$(selector).click();
  };

  const waitUntilGone = (selector, timeoutMsg) => b.waitUntil(async () => !(await b.$(selector).isExisting()), { ...WAIT, timeoutMsg });

  const fireDrag = async (selector, type, at = 'middle') => {
    await waitUntilExists(selector, `${name} has no ${selector} for ${type}`);
    await b.execute(fireDragEvent, await b.$(selector), type, at);
  };

  /**
   * WebDriver's drag does nothing in WebView2, because no `dragstart` fires. So a drag is synthetic events,
   * and the target is looked up only after `dragstart`, because some targets show only during a drag.
   * It skips the gesture itself, which the Manual smoke covers.
   */
  const drag = async (source, target, at = 'middle') => {
    await fireDrag(source, 'dragstart');
    await fireDrag(target, 'dragover', at);
    await fireDrag(target, 'drop', at);
    await fireDrag(source, 'dragend');
  };

  /** `files` are what `asset()` gives. The input is hidden, as a file picker's always is. */
  const upload = async (input, files) => {
    await waitUntilExists(input, `${name} has no ${input}`);
    await b.execute(chooseFiles, await b.$(input), files);
  };

  /** `isReady` runs in the page, on the element: an image has loaded, or a player has read its video. */
  const waitUntilLoaded = (selector, timeoutMsg, isReady = hasLoaded) =>
    b.waitUntil(async () => (await b.$(selector).isExisting()) && b.execute(isReady, await b.$(selector)), { ...WAIT, timeoutMsg });

  /** A field that opens focused, with its text chosen, so typing replaces it. */
  const typeInFocused = async (selector, text) => {
    const focused = async () => (await b.$(selector).isExisting()) && b.execute((field) => field === document.activeElement, await b.$(selector));
    await b.waitUntil(focused, {
      ...WAIT,
      timeoutMsg: `${name} is not typing in ${selector}`,
    });
    await b.keys(text);
    await b.keys('Enter');
  };

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
    /** The app marks a chat read only while its window has focus, as when a person looks at it. */
    async readChat(title) {
      await bringToFront();
      await user.openChat(title);
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
        await waitUntilExists(messageButton(text, label), `${name} has no ${label} on "${text}"`);
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
    seesOnline: (person) => waitUntilShown(chatRowWith(person, en['side.online']), `${name} did not see ${person} online`),
    seesGroup: (title, counts) =>
      waitUntilShown(chatRowWith(title, groupStatus(counts)), `${name} did not see ${title} as "${groupStatus(counts)}"`),
    async createGroup(title, members) {
      await press(`aria/${en['side.createGroup']}`);
      await fill(en['group.nameLabel'], title);
      for (const person of members) await press(memberChoice(person));
      await press(`aria/${en['people.createGroup']}`);
      await user.seesChatInList(title);
      // Not the composer: the chat open before has one too. Only the new group is empty.
      await waitUntilShown(textSelector(en['chat.noMessages']), `${name} did not open ${title}`);
    },

    attach: (...files) => upload(ATTACH_INPUT, files.map((file) => asset(file))),
    /** More files than a message takes, all copies of one, each under its own name. */
    attachCopies: (file, count) =>
      upload(ATTACH_INPUT, Array.from({ length: count }, (_, i) => asset(file, `${i + 1}-${file}`))),
    seesStaged: (file) => waitUntilShown(staged(file), `${name} does not see ${file} waiting to be sent`),
    stopsSeeingStaged: (file) => waitUntilGone(staged(file), `${name} still sees ${file} waiting to be sent`),
    removeStaged: (file) => press(`${staged(file)}/button`),
    async seesStagedCount(count) {
      await waitUntilShown(`(${REMOVE_STAGED})[${count}]`, `${name} does not see ${count} files waiting`);
      if (await b.$(`(${REMOVE_STAGED})[${count + 1}]`).isExisting()) throw new Error(`${name} sees more than ${count} files waiting`);
    },
    seesWrongFileType: () => waitUntilShown(roleSelector('alert', en['error.media_type']), `${name} was not told the file is the wrong type`),
    seesTooManyFiles: () => waitUntilShown(roleSelector('alert', en['error.too_many_attachments']), `${name} was not told there are too many files`),
    sendStaged: () => press(`aria/${en['chat.send']}`),
    seesPhoto: (photoName) => waitUntilLoaded(sentPhoto(photoName), `${name} did not see the photo ${photoName} load`),
    seesPhotoWithCaption: (photoName, caption) =>
      waitUntilLoaded(`${messageRow(caption)}${photo(photoName)}`, `${name} did not see the photo ${photoName} load with "${caption}"`),
    /** In one message, so they were sent together, and both loaded. */
    async seesPhotosTogether(first, second) {
      const together = `//*[@data-testid="message"][.${photo(first)}][.${photo(second)}]`;
      for (const one of [first, second]) await waitUntilLoaded(`${together}${photo(one)}`, `${name} did not see ${one} load beside the other in one message`);
    },
    async openGifPicker() {
      await press(GIF_BUTTON);
      await waitUntilShown(GIF_SEARCH, `${name} has no GIF picker`);
    },
    searchGifs: (text) => b.$(GIF_SEARCH).setValue(text),
    /** Its thumbnail loaded from the stub. */
    seesGifInPicker: (title) => waitUntilLoaded(`${gifResult(title)}/img`, `${name} did not see the GIF "${title}" in the picker`),
    pickGif: (title) => press(gifResult(title)),
    /** By its address, because a sent GIF's image comes from giphy.com and does not load in tests. */
    seesGif: (title) => waitUntilExists(`//*[@data-testid="message"]${gifAt([gifAddress(title)])}`, `${name} did not see the GIF "${title}" in the chat`),
    /** `/giphy` picks one of the results at random, so any of them will do, under the search it came from. */
    seesGifFoundBy: (search) =>
      waitUntilExists(
        `${messageRow(`/giphy ${search}`)}${gifAt(gifTitles(search).map(gifAddress))}`,
        `${name} did not see a GIF found by "/giphy ${search}"`,
      ),
    seesVideoWithCaption: (caption) =>
      waitUntilLoaded(`${messageRow(caption)}//video`, `${name} has no player that read the video sent with "${caption}"`, hasMetadata),
    async doesNotSeePhoto(photoName) {
      if (await b.$(sentPhoto(photoName)).isExisting()) throw new Error(`${name} sees the photo ${photoName}`);
    },

    seesTab: (title) => waitUntilShown(tab(title), `${name} has no tab for ${title}`),
    stopsSeeingTab: (title) => waitUntilGone(tab(title), `${name} still has a tab for ${title}`),
    /** The tab of the chat shown, whose close button is always there. */
    closeTab: (title) => press(tabClose(title)),
    /** Any other tab shows its close button only on hover. */
    closeBackgroundTab: (title) => pressHoverOnly(tabClose(title)),
    showTab: (title) => press(`${tab(title)}/button[.//span[normalize-space(.)="${title}"]]`),
    splitView: (title, side) => drag(tab(title), tabDrop(side)),
    /** Two chats shown at once, each with its own composer. The panes sit in a row, so the first in the page is on the left. */
    async seesSideBySide(leftMessage, rightMessage) {
      await waitUntilShown(secondComposer, `${name} does not see two chats at once`);
      await waitUntilShown(followedBy(messageRow(leftMessage), messageRow(rightMessage)), `${name} did not see "${leftMessage}" left of "${rightMessage}"`);
    },
    async seesOneChatAtATime() {
      await waitUntilGone(secondComposer, `${name} still sees two chats at once`);
      await waitUntilShown(COMPOSER, `${name} has no chat open`);
    },
    /**
     * Drags the tab out of the window, which opens the chat in a window of its own, then acts there.
     * Found as the one new window, because its handle holds the conversation ID.
     */
    async popOut(title) {
      const before = await b.getWindowHandles();
      await fireDrag(tab(title), 'dragstart');
      await b.execute(leaveWindowDragging);
      await fireDrag(tab(title), 'dragend', 'outside');
      let popout;
      await b.waitUntil(async () => (popout = (await b.getWindowHandles()).find((handle) => !before.includes(handle))), {
        ...WAIT,
        timeoutMsg: `${name} did not get a window for ${title}`,
      });
      await b.switchToWindow(popout);
      await waitUntilShown(COMPOSER, `${name} has no composer in the window for ${title}`);
    },
    returnToMainWindow: () => b.switchToWindow(MAIN_WINDOW),
    async seesOnlyMainWindow() {
      const handles = await b.getWindowHandles();
      if (handles.length !== 1 || handles[0] !== MAIN_WINDOW) throw new Error(`${name} has windows ${handles.join(', ')}`);
    },

    seesLastOnline: (person, time) =>
      waitUntilShown(chatRowWith(person, lastOnline(time)), `${name} did not see ${person} last online ${time}`),
    searchChats: (text) => fill(en['side.search'], text),
    seesNoChatsFound: () => waitUntilShown(textSelector(en['side.noResults']), `${name} was shown a chat`),
    stopsSeeingChatInList: (title) => waitUntilGone(chatRow(title), `${name} still has ${title} in the list`),
    seesChatAbove: (upper, lower) =>
      waitUntilShown(followedBy(chatRow(upper), chatRow(lower)), `${name} did not see ${upper} above ${lower}`),
    seesSectionAbove: (upper, lower) =>
      waitUntilShown(followedBy(section(upper), section(lower)), `${name} did not see ${upper} above ${lower}`),
    seesChatInSection: (title, sectionTitle) =>
      waitUntilShown(`${section(sectionTitle)}${chatRow(title)}`, `${name} did not see ${title} in ${sectionTitle}`),
    /** A folder's name field chooses its text on focus and saves on blur, so its window must be in front. */
    async createFolder(title) {
      await bringToFront();
      await press(`aria/${en['side.newFolder']}`);
      await typeInFocused(FOLDER_NAME, title);
      await waitUntilShown(section(title), `${name} has no folder called ${title}`);
    },
    /** Rename and Delete show only on hover. */
    async renameFolder(title, newTitle) {
      await bringToFront();
      await pressHoverOnly(folderControl(title, en['side.renameFolder']));
      await typeInFocused(FOLDER_NAME, newTitle);
      await waitUntilShown(section(newTitle), `${name} has no folder called ${newTitle}`);
    },
    async deleteFolder(title) {
      await pressHoverOnly(folderControl(title, en['side.deleteFolder']));
      await waitUntilGone(section(title), `${name} still has the folder ${title}`);
    },
    moveChatToFolder: (title, folder) => drag(chatRow(title), sectionHeading(folder)),
    /** The top of a row puts the chat before it. */
    moveChatAbove: (title, other) => drag(chatRow(title), chatRow(other), 'top'),
    /** A section takes a dragged section on its whole area, and its top half puts it before. */
    moveSectionAbove: (title, other) => drag(sectionHeading(title), section(other), 'top'),

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

/** Alice has Weekend, and a direct chat each with Bob and Carol. Bob stays idle. */
export async function soloWithChats() {
  await reset('groups');
  const alice = drivenUser('alice');
  for (const title of ['Weekend', USERS.bob.name, USERS.carol.name]) await alice.seesChatInList(title);
  await alice.hasNoChatOpen();
  return { alice };
}

export async function twoFriendsWithChatOpen() {
  await reset('friends');
  const { alice, bob } = aliceAndBob();
  await alice.openChat(USERS.bob.name);
  await bob.openChat(USERS.alice.name);
  return { alice, bob };
}
