// A Scripted user acts through public functions with a token from their session, and has no app of their own.
// So their reads go through queries, and a read waits the way a Driven user's does.
import fs from 'node:fs';
import { api } from '../convex/_generated/api.js';
import { INTERFACE_WAIT_MS, SESSIONS_FILE } from './config.mjs';
import { clientFor } from './session-client.mjs';

const POLL_MS = 100;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(check, timeoutMsg) {
  const end = Date.now() + INTERFACE_WAIT_MS;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(timeoutMsg);
    await sleep(POLL_MS);
  }
}

export async function scriptedUser(name) {
  const client = await clientFor(JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'))[name], name);
  /** By title, because IDs differ between runs. */
  const chat = async (title) => (await client.query(api.conversations.list, {})).find((c) => c.title === title);
  const chatId = async (title) => {
    const found = await chat(title);
    if (!found) throw new Error(`${name} has no chat called ${title}`);
    return found._id;
  };
  const latestBodies = async (title) => {
    const { page } = await client.query(api.messages.list, {
      conversationId: await chatId(title),
      paginationOpts: { numItems: 30, cursor: null },
    });
    return page.map((message) => message.body);
  };

  return {
    async send(title, body) {
      await client.mutation(api.messages.send, { conversationId: await chatId(title), body });
    },
    /** Shows Carol as online to the others, as her app would. */
    comesOnline: () => client.mutation(api.users.heartbeat, {}),

    seesMessage: (title, text) =>
      waitUntil(async () => (await latestBodies(title)).includes(text), `${name} did not see the message "${text}" in ${title}`),
    seesChat: (title) => waitUntil(async () => Boolean(await chat(title)), `${name} has no chat called ${title}`),
    async hasNoChat(title) {
      if (await chat(title)) throw new Error(`${name} has the chat ${title}`);
    },
    async seesMembers(title, names) {
      const info = await client.query(api.conversations.get, { conversationId: await chatId(title) });
      const members = info.members.map((member) => member.name).sort();
      if (members.join(', ') !== [...names].sort().join(', ')) throw new Error(`${name} sees ${title} with ${members.join(', ')}`);
    },
  };
}
