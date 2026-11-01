// PROTOTYPE, throwaway. Builds Seeds through real sign-up and public functions, then snapshots them.
import fs from 'node:fs';
import path from 'node:path';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi as api } from 'convex/server';
import { getSetCookie } from '@convex-dev/better-auth/client/plugins';
import { APP_ORIGIN, CLOUD, FRIENDS_ROWS, PASSWORD, SESSIONS_FILE, SITE, SNAPSHOTS, USERS, convexSync } from './config.mjs';
import { readRows } from './fixtures.mjs';

/** The package's own helper writes the format crossDomainClient keeps in localStorage. */
const toCookieStore = (header) => JSON.parse(getSetCookie(header));

const cookieHeader = (store) => Object.entries(store).map(([k, v]) => `${k}=${v.value}`).join('; ');

async function signUp({ name, email }) {
  const res = await fetch(`${SITE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_ORIGIN, 'better-auth-cookie': '' },
    body: JSON.stringify({ name, email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-up ${email}: ${res.status} ${await res.text()}`);
  const store = toCookieStore(res.headers.get('set-better-auth-cookie') ?? '');

  const tokenRes = await fetch(`${SITE}/api/auth/convex/token`, {
    headers: { origin: APP_ORIGIN, 'better-auth-cookie': cookieHeader(store) },
  });
  if (!tokenRes.ok) throw new Error(`token ${email}: ${tokenRes.status} ${await tokenRes.text()}`);
  const { token } = await tokenRes.json();

  const client = new ConvexHttpClient(CLOUD);
  client.setAuth(token);
  const profileId = await client.mutation(api.users.ensureProfile, {});
  return { client, store, profileId };
}

function snapshot(name) {
  fs.mkdirSync(SNAPSHOTS, { recursive: true });
  const file = path.join(SNAPSHOTS, `${name}.zip`);
  convexSync(['export', '--path', file]);
  return file;
}

export async function buildSeeds(time) {
  // Base Seed: the users, and nothing else.
  const users = await time('seed: sign up 3 users', async () => {
    const out = {};
    for (const [key, user] of Object.entries(USERS)) out[key] = await signUp(user);
    return out;
  });
  await time('seed: staged internal function (convex run)', async () => convexSync(['run', 'e2eSeed:fixAvatars']));
  await time('seed: export base', async () => snapshot('base'));

  // friends: Alice and Bob are friends with a direct chat, and Carol is a stranger.
  await time('seed: friends through public functions', async () => {
    await users.alice.client.mutation(api.friends.request, { profileId: users.bob.profileId });
    const { incoming } = await users.bob.client.query(api.friends.list, {});
    const conversationId = await users.bob.client.mutation(api.friends.accept, { friendshipId: incoming[0].friendshipId });
    await users.alice.client.mutation(api.messages.send, { conversationId, body: 'Seeded hello' });
  });
  await time('seed: export friends', async () => snapshot('friends'));
  // Baseline for the write probe: nothing but the harness has touched the data yet.
  fs.writeFileSync(FRIENDS_ROWS, JSON.stringify(readRows()));

  const sessions = Object.fromEntries(Object.entries(users).map(([k, u]) => [k, JSON.stringify(u.store)]));
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}
