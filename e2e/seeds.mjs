// Builds the Seeds through real sign-up and public functions, then snapshots them.
import fs from 'node:fs';
import path from 'node:path';
import { getSetCookie } from '@convex-dev/better-auth/client/plugins';
import { api } from '../convex/_generated/api.js';
import {
  APP_ORIGIN,
  ASSET_TYPES,
  ASSETS,
  EXPIRED_INVITE_TOKEN,
  FOOTBALL_FRIENDS,
  HISTORY_MESSAGES,
  MEDIA_SEED,
  PASSWORD,
  SESSIONS_FILE,
  SITE_URL,
  SNAPSHOTS,
  TEST_LIMIT_MS,
  USERS,
} from './config.mjs';
import { clientFor } from './session-client.mjs';
import { convexInStage, importSeed } from './stage.mjs';
import { espnEvent, FOOTBALL_TEAMS, footballMatches, SEEDED_MATCHES, SEEDED_PINS } from './stub.mjs';

/** Carol's last sign of life in the `groups` Seed. Far past the 2 minutes that count as online, so "Last online" reads the same all run. */
const CAROL_AWAY_MS = 3 * 24 * 60 * 60_000;

async function signUp({ name, email }) {
  const res = await fetch(`${SITE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_ORIGIN, 'better-auth-cookie': '' },
    body: JSON.stringify({ name, email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-up ${email}: ${res.status} ${await res.text()}`);
  // The package's own helpers read and write the format that crossDomainClient keeps in localStorage.
  const session = getSetCookie(res.headers.get('set-better-auth-cookie') ?? '');
  const client = await clientFor(session, email);
  const profileId = await client.mutation(api.users.ensureProfile, {});
  return { client, session, profileId };
}

/** `withFiles` takes Convex file storage along, where avatars live. */
function snapshot(seed, { withFiles = false } = {}) {
  convexInStage(['export', ...(withFiles ? ['--include-file-storage'] : []), '--path', path.join(SNAPSHOTS, `${seed}.zip`)]);
}

async function buildBase() {
  const users = {};
  for (const [key, user] of Object.entries(USERS)) users[key] = await signUp(user);
  convexInStage(['run', 'e2eSeed:fixAvatars']);
  snapshot('base');
  return users;
}

/** Returns their direct chat. The request is the only one the accepter has. */
async function befriend(requester, accepter) {
  await requester.client.mutation(api.friends.request, { profileId: accepter.profileId });
  const { incoming } = await accepter.client.query(api.friends.list, {});
  return accepter.client.mutation(api.friends.accept, { friendshipId: incoming[0].friendshipId });
}

async function buildFriends({ alice, bob }) {
  const conversationId = await befriend(alice, bob);
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
  // Seed work grows with this one, so each run shows its share. "Measured on Windows" in the spec holds the figure.
  console.log(`[e2e] the history Seed took ${((Date.now() - start) / 1000).toFixed(1)} s`);
}

/** Branches from `friends`. Carol's old `lastSeenAt` needs the internal fallback, which says why. */
async function buildGroups({ alice, bob, carol }) {
  importSeed('friends');
  for (const friend of [alice, bob]) await befriend(carol, friend);
  const conversationId = await alice.client.mutation(api.conversations.createGroup, {
    name: 'Weekend',
    memberIds: [bob.profileId, carol.profileId],
  });
  await carol.client.mutation(api.messages.send, { conversationId, body: 'Seeded group hello' });
  const away = { email: USERS.carol.email, lastSeenAt: Date.now() - CAROL_AWAY_MS };
  convexInStage(['run', 'e2eSeed:setLastSeenAt', JSON.stringify(away)]);
  snapshot('groups');
}

/** The app's own path: a signed address from Convex, then a PUT to it, which in a run reaches the stub. */
async function sendAsset(user, conversationId, { file, caption }) {
  const bytes = fs.readFileSync(path.join(ASSETS, file));
  const mime = ASSET_TYPES[path.extname(file)];
  const { key, uploadUrl } = await user.client.action(api.media.createUpload, { conversationId, mime, size: bytes.length });
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': mime }, body: bytes });
  if (!put.ok) throw new Error(`upload ${file}: ${put.status}`);
  await user.client.mutation(api.messages.sendAttachments, { conversationId, body: caption, files: [{ key, mime, size: bytes.length, name: file }] });
}

async function setAvatar(user, file) {
  const uploadUrl = await user.client.mutation(api.users.generateAvatarUploadUrl, {});
  const res = await fetch(uploadUrl, { method: 'POST', headers: { 'content-type': ASSET_TYPES[path.extname(file)] }, body: fs.readFileSync(path.join(ASSETS, file)) });
  if (!res.ok) throw new Error(`avatar ${file}: ${res.status}`);
  await user.client.mutation(api.users.setAvatar, { storageId: (await res.json()).storageId });
}

/**
 * Branches from `friends`. The preview comes from the internal `previews:save`, because fetching one would leave the machine.
 * Exported with file storage, because Alice's avatar is there. The photo and video stay in the stub, which a Reset does not touch.
 */
async function buildMedia({ alice }, conversationId) {
  importSeed('friends');
  await sendAsset(alice, conversationId, MEDIA_SEED.photo);
  await sendAsset(alice, conversationId, MEDIA_SEED.video);
  const { url, caption } = MEDIA_SEED.link;
  await alice.client.mutation(api.messages.send, { conversationId, body: `${caption} ${url}` });
  convexInStage(['run', 'previews:save', JSON.stringify({ url, ok: true, ...MEDIA_SEED.preview })]);
  await setAvatar(alice, MEDIA_SEED.avatar);
  snapshot('media', { withFiles: true });
}

/** Waits until no scheduled function is left, such as the next-match lookups a pin starts. Each look is a CLI call. */
async function untilNoPendingJobs() {
  const end = Date.now() + TEST_LIMIT_MS;
  while (Number(convexInStage(['run', 'e2eSeed:pendingJobs']).stdout.trim()) > 0) {
    if (Date.now() > end) throw new Error('the football Seed still has scheduled functions running');
  }
}

/**
 * Branches from `groups`, which has Weekend for the group-chat scenario and Alice's chat with Carol. Dave and Erin
 * join here. The index and the pins go the real way, through the stub; the matches no lookup gives come from the stage.
 */
async function buildFootball(users) {
  importSeed('groups');
  const friends = {};
  for (const [key, user] of Object.entries(FOOTBALL_FRIENDS)) friends[key] = await signUp(user);
  convexInStage(['run', 'e2eSeed:fixAvatars']);
  const carolChat = (await users.alice.client.query(api.conversations.list, {})).find((c) => c.title === USERS.carol.name);
  const chats = { carol: carolChat._id };
  for (const key of Object.keys(FOOTBALL_FRIENDS)) chats[key] = await befriend(users.alice, friends[key]);

  convexInStage(['run', 'footballTeams:rebuildIndex']);
  for (const [friend, teams] of Object.entries(SEEDED_PINS)) {
    for (const team of teams) await users.alice.client.mutation(api.teamPins.add, { conversationId: chats[friend], teamId: FOOTBALL_TEAMS[team].id });
  }
  await untilNoPendingJobs();

  const now = Date.now();
  const matches = footballMatches(now);
  const seeded = (name) => ({
    league: FOOTBALL_TEAMS[matches[name].home].league,
    event: espnEvent(matches[name]),
    fetchedAt: now - (SEEDED_MATCHES.staleMs[name] ?? 0),
  });
  const pointers = (byTeam) => Object.entries(byTeam).map(([team, name]) => ({ teamId: FOOTBALL_TEAMS[team].id, eventId: matches[name].eventId }));
  const names = [...Object.values(SEEDED_MATCHES.last), ...Object.values(SEEDED_MATCHES.next)];
  const seed = { matches: names.map(seeded), last: pointers(SEEDED_MATCHES.last), next: pointers(SEEDED_MATCHES.next) };
  convexInStage(['run', 'e2eSeed:seedFootballMatches', JSON.stringify(seed)]);
  snapshot('football');
}

export async function buildSeeds() {
  fs.mkdirSync(SNAPSHOTS, { recursive: true });
  const users = await buildBase();
  const directChat = await buildFriends(users);
  buildExpiredInvite();
  await buildHistory(users, directChat);
  await buildGroups(users);
  await buildMedia(users, directChat);
  await buildFootball(users);

  const sessions = Object.fromEntries(Object.entries(users).map(([key, { session }]) => [key, session]));
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions));
}
