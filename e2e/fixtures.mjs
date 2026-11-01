// What a test works with: domain actions per user. Selectors and waits live here, never in a test.
import { en } from '../src/i18n/en.ts';
import { USERS } from './config.mjs';
import { reset } from './reset.mjs';

const WAIT = { timeout: 5_000, interval: 100 };
const COMPOSER = `aria/${en['chat.composer']}`;
const textSelector = (text) => `//*[contains(normalize-space(.), "${text}") and not(*)]`;

function drivenUser(name) {
  const b = browser.getInstance(name);
  /** Looks the element up on every poll: a message row gets replaced, and a held element then never reads as displayed. */
  const sees = (selector, timeoutMsg) => b.waitUntil(async () => b.$(selector).isDisplayed(), { ...WAIT, timeoutMsg });

  /** The driver's click() also presses covered and hidden buttons, so a click must first prove a person could do it. */
  const press = async (selector) => {
    await b.waitUntil(async () => b.$(selector).isClickable(), { ...WAIT, timeoutMsg: `${name} could not press ${selector}` });
    await b.$(selector).click();
  };

  return {
    async openChat(title) {
      await press(`aria/${title}`);
      await sees(COMPOSER, `${name} has no composer in the chat with ${title}`);
    },
    async send(text) {
      await b.$(COMPOSER).setValue(text);
      await b.keys('Enter');
    },
    sees: (text) => sees(textSelector(text), `${name} did not see "${text}"`),
    async doesNotSee(text) {
      if (await b.$(textSelector(text)).isExisting()) throw new Error(`${name} still sees "${text}"`);
    },
  };
}

export async function twoFriendsWithChatOpen() {
  await reset('friends');
  const alice = drivenUser('alice');
  const bob = drivenUser('bob');
  await alice.openChat(USERS.bob.name);
  await bob.openChat(USERS.alice.name);
  return { alice, bob };
}
