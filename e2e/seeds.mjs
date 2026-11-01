// Builds the Seeds through real sign-up and public functions, then snapshots them.
import fs from 'node:fs';
import path from 'node:path';
import { getCookie, getSetCookie } from '@convex-dev/better-auth/client/plugins';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import { APP_ORIGIN, CONVEX_URL, EXPIRED_INVITE_TOKEN, PASSWORD, SESSIONS_FILE, SITE_URL, SNAPSHOTS, USERS } from './config.mjs';
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
}

/** Branches from `base`, so that Seed goes back in first. No public function can make an invite that has expired. */
function buildExpiredInvite() {
  importSeed('base');
  const invite = { token: EXPIRED_INVITE_TOKEN, createdByEmail: USERS.alice.email };
  convexInStage(['run', 'e2eSeed:expiredInvite', JSON.stringify(invite)]);
  snapshot('expired-invite');
}

export async function buildSeeds() {
  fs.mkdirSync(SNAPSHOTS, { recursive: true });
  const users = await buildBase();
  await buildFriends(users);
  buildExpiredInvite();

  const sessions = Object.fromEntries(Object.entries(users).map(([key, { session }]) => [key, session]));
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions));
}
