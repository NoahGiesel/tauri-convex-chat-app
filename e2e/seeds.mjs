// Builds the Seeds through real sign-up and public functions, then snapshots them.
import fs from 'node:fs';
import path from 'node:path';
import { getCookie, getSetCookie } from '@convex-dev/better-auth/client/plugins';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import { APP_ORIGIN, CONVEX_URL, EXPIRED_INVITE_TOKEN, HISTORY_MESSAGES, PASSWORD, SESSIONS_FILE, SITE_URL, SNAPSHOTS, USERS } from './config.mjs';
import { convexInStage, importSeed } from './stage.mjs';

async function signUp({ name, email }) {
  const res = await fetch(`${SITE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_ORIGIN, 'better-auth-cookie': '' },
    body: JSON.stringify({ name, email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-up ${email}: ${res.status} ${await res.text()}`);
  // The package's own helpers read and write the format that crossDomainClient keeps in localStorage.
  const session = getSetCookie(res.headers.get('set-better-auth-cookie') ?? '');

  const tokenRes = await fetch(`${SITE_URL}/api/auth/convex/token`, {
    headers: { origin: APP_ORIGIN, 'better-auth-cookie': getCookie(session) },
  });
  if (!tokenRes.ok) throw new Error(`token ${email}: ${tokenRes.status} ${await tokenRes.text()}`);

  const client = new ConvexHttpClient(CONVEX_URL);
  client.setAuth((await tokenRes.json()).token);
  const profileId = await client.mutation(api.users.ensureProfile, {});
  return { client, session, profileId };
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
  return conversationId;
}

/** Branches from `base`, so that Seed goes back in first. No public function can make an invite that has expired. */
function buildExpiredInvite() {
  importSeed('base');
  const invite = { token: EXPIRED_INVITE_TOKEN, createdByEmail: USERS.alice.email };
  convexInStage(['run', 'e2eSeed:expiredInvite', JSON.stringify(invite)]);
  snapshot('expired-invite');
}

/** Branches from `friends`. Zero-padded, so that no message's text holds another's, as "History 1" would hold "History 10". */
async function buildHistory({ alice, bob }, conversationId) {
  const start = Date.now();
  importSeed('friends');
  for (let i = 1; i <= HISTORY_MESSAGES; i++) {
    const author = i % 2 ? bob : alice;
    await author.client.mutation(api.messages.send, { conversationId, body: `History ${String(i).padStart(2, '0')}` });
  }
  snapshot('history');
  // The spec records this time. A Seed this big was never measured before.
  console.log(`[e2e] the history Seed took ${((Date.now() - start) / 1000).toFixed(1)} s`);
}

export async function buildSeeds() {
  fs.mkdirSync(SNAPSHOTS, { recursive: true });
  const users = await buildBase();
  const directChat = await buildFriends(users);
  buildExpiredInvite();
  await buildHistory(users, directChat);

  const sessions = Object.fromEntries(Object.entries(users).map(([key, { session }]) => [key, session]));
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions));
}
