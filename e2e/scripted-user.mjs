// A Scripted user acts through public functions with a token from their session, and has no app of their own.
// So their reads go through queries, and a read waits the way a Driven user's does.
import fs from 'node:fs';
import { api } from '../convex/_generated/api.js';
import { SESSIONS_FILE } from './config.mjs';
import { clientFor } from './session-client.mjs';
import { waitUntil } from './wait.mjs';

/** The newest page, as the app loads it first. */
const PAGE_SIZE = 30;

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
      paginationOpts: { numItems: PAGE_SIZE, cursor: null },
    });
    return page.map((message) => message.body);
  };

  const memberNames = async (title) => {
    const info = await client.query(api.conversations.get, { conversationId: await chatId(title) });
    return info.members.map((member) => member.name).sort().join(', ');
  };

  return {
    async send(title, body) {
      await client.mutation(api.messages.send, { conversationId: await chatId(title), body });
    },
    /** Shows this user online to the others, as their app would. */
    comesOnline: () => client.mutation(api.users.heartbeat, {}),
    /** Also deletes the file from Convex storage. */
    removeProfilePhoto: () => client.mutation(api.users.removeAvatar, {}),
    /** The server tried the link and found nothing to show. */
    seesFailedPreview: (url) =>
      waitUntil(async () => (await client.query(api.previews.get, { url }))?.ok === false, `${name} has no failed preview for ${url}`),

    seesMessage: (title, text) =>
      waitUntil(async () => (await latestBodies(title)).includes(text), `${name} did not see the message "${text}" in ${title}`),
    seesChat: (title) => waitUntil(async () => Boolean(await chat(title)), `${name} has no chat called ${title}`),
    async hasNoChat(title) {
      if (await chat(title)) throw new Error(`${name} has the chat ${title}`);
    },
    async seesMembers(title, names) {
      const expected = [...names].sort().join(', ');
      let seen = '';
      await waitUntil(async () => (seen = await memberNames(title)) === expected, () => `${name} sees ${title} with ${seen}`);
    },
  };
}
