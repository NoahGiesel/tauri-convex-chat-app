// Builds the Seeds through real sign-up and public functions, then snapshots them.
import fs from 'node:fs';
import path from 'node:path';
import { getSetCookie } from '@convex-dev/better-auth/client/plugins';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi as api } from 'convex/server';
import { APP_ORIGIN, CONVEX_URL, PASSWORD, SESSIONS_FILE, SITE_URL, SNAPSHOTS, USERS } from './config.mjs';
import { convexInStage } from './stage.mjs';

const cookieHeader = (store) => Object.entries(store).map(([key, { value }]) => `${key}=${value}`).join('; ');

async function signUp({ name, email }) {
  const res = await fetch(`${SITE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_ORIGIN, 'better-auth-cookie': '' },
    body: JSON.stringify({ name, email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-up ${email}: ${res.status} ${await res.text()}`);
  // The package's own helper writes the format that crossDomainClient keeps in localStorage.
  const store = JSON.parse(getSetCookie(res.headers.get('set-better-auth-cookie') ?? ''));

  const tokenRes = await fetch(`${SITE_URL}/api/auth/convex/token`, {
    headers: { origin: APP_ORIGIN, 'better-auth-cookie': cookieHeader(store) },
  });
  if (!tokenRes.ok) throw new Error(`token ${email}: ${tokenRes.status} ${await tokenRes.text()}`);

  const client = new ConvexHttpClient(CONVEX_URL);
  client.setAuth((await tokenRes.json()).token);
  const profileId = await client.mutation(api.users.ensureProfile, {});
  return { client, store, profileId };
}

function snapshot(seed) {
  convexInStage(['export', '--path', path.join(SNAPSHOTS, `${seed}.zip`)]);
}

async function buildBase() {
  const users = {};
  for (const [key, user] of Object.entries(USERS)) users[key] = await signUp(user);
  convexInStage(['run', 'e2eSeed:fixAvatars']);
  snapshot('base');
  return users;
}

async function buildFriends({ alice, bob }) {
  await alice.client.mutation(api.friends.request, { profileId: bob.profileId });
  const { incoming } = await bob.client.query(api.friends.list, {});
  const conversationId = await bob.client.mutation(api.friends.accept, { friendshipId: incoming[0].friendshipId });
  await alice.client.mutation(api.messages.send, { conversationId, body: 'Seeded hello' });
  snapshot('friends');
}

export async function buildSeeds() {
  fs.mkdirSync(SNAPSHOTS, { recursive: true });
  const users = await buildBase();
  await buildFriends(users);

  const sessions = Object.fromEntries(Object.entries(users).map(([key, { store }]) => [key, JSON.stringify(store)]));
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions));
}
