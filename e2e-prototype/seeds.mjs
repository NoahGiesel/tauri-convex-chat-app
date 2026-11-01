// PROTOTYPE, throwaway. Builds Seeds through real sign-up and public functions, then snapshots them.
import fs from 'node:fs';
import path from 'node:path';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi as api } from 'convex/server';
import { getSetCookie } from '@convex-dev/better-auth/client/plugins';
import { APP_ORIGIN, CLOUD, FIXTURE_PNG, FRIENDS_ROWS, PASSWORD, SESSIONS_FILE, SITE, SNAPSHOTS, USERS, convexSync } from './config.mjs';
import { readRows } from './fixtures.mjs';

/** Real-path helpers for the media Seed. */
export async function uploadToR2(client, conversationId, bytes, name, mime) {
  const { key, uploadUrl } = await client.action(api.media.createUpload, { conversationId, mime, size: bytes.length });
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': mime }, body: bytes });
  if (!put.ok) throw new Error(`stub PUT ${put.status}`);
  return { key, mime, size: bytes.length, name };
}

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

  // groups: everyone is friends, with a group chat. Extends friends.
  await time('seed: groups through public functions', async () => {
    await users.carol.client.mutation(api.friends.request, { profileId: users.alice.profileId });
    await users.carol.client.mutation(api.friends.request, { profileId: users.bob.profileId });
    for (const u of [users.alice, users.bob]) {
      const { incoming } = await u.client.query(api.friends.list, {});
      await u.client.mutation(api.friends.accept, { friendshipId: incoming[0].friendshipId });
    }
    const conversationId = await users.alice.client.mutation(api.conversations.createGroup, {
      name: 'Weekend', memberIds: [users.bob.profileId, users.carol.profileId],
    });
    await users.carol.client.mutation(api.messages.send, { conversationId, body: 'Seeded group hello' });
  });
  await time('seed: export groups', async () => snapshot('groups'));

  // media: friends, with one attachment and a Seeded link preview. Branches from friends.
  await time('seed: media', async () => {
    convexSync(['import', '--replace-all', '--yes', path.join(SNAPSHOTS, 'friends.zip')]);
    const conversationId = (await users.alice.client.query(api.conversations.list, {}))[0]._id;
    const png = fs.readFileSync(FIXTURE_PNG);
    const file = await uploadToR2(users.alice.client, conversationId, png, 'seeded.png', 'image/png');
    await users.alice.client.mutation(api.messages.sendAttachments, { conversationId, body: 'Seeded photo', files: [file] });
    convexSync(['run', 'previews:save', JSON.stringify({ url: 'https://example.invalid/page', ok: true, title: 'Seeded preview title', siteName: 'Example' })]);
    const uploadUrl = await users.alice.client.mutation(api.users.generateAvatarUploadUrl, {});
    const posted = await fetch(uploadUrl, { method: 'POST', headers: { 'content-type': 'image/png' }, body: png });
    const { storageId } = await posted.json();
    await users.alice.client.mutation(api.users.setAvatar, { storageId });
  });
  await time('seed: export media with files', async () => {
    fs.mkdirSync(SNAPSHOTS, { recursive: true });
    convexSync(['export', '--include-file-storage', '--path', path.join(SNAPSHOTS, 'media.zip')]);
  });

  const sessions = Object.fromEntries(Object.entries(users).map(([k, u]) => [k, JSON.stringify(u.store)]));
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}
