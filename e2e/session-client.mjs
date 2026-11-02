// A Convex client that acts as a user, from the session the app keeps in localStorage. Seeds and Scripted users share it.
import { getCookie } from '@convex-dev/better-auth/client/plugins';
import { ConvexHttpClient } from 'convex/browser';
import { APP_ORIGIN, CONVEX_URL, SITE_URL } from './config.mjs';

export async function clientFor(session, who) {
  const res = await fetch(`${SITE_URL}/api/auth/convex/token`, {
    headers: { origin: APP_ORIGIN, 'better-auth-cookie': getCookie(session) },
  });
  if (!res.ok) throw new Error(`token ${who}: ${res.status} ${await res.text()}`);
  const client = new ConvexHttpClient(CONVEX_URL);
  client.setAuth((await res.json()).token);
  return client;
}
