import { AwsClient } from "aws4fetch";
import { fail } from "./model";

/** Client S3 per Cloudflare R2. Le chiavi stanno nelle variabili d'ambiente di Convex, mai nel client. */
export function r2() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) throw fail("media_not_configured");
  return {
    client: new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" }),
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
  };
}

const HOUR = 60 * 60 * 1000;

/**
 * Link di lettura firmato per un file del bucket privato.
 * La firma parte dall'inizio dell'ora corrente e dura 24 ore: dentro la stessa ora il link non cambia
 * (la lista messaggi non si aggiorna a vuoto e il browser tiene le immagini in cache) e resta valido per almeno 23 ore.
 */
export async function signedReadUrl(key: string): Promise<string> {
  const { client, endpoint } = r2();
  const datetime = new Date(Math.floor(Date.now() / HOUR) * HOUR)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const url = new URL(`${endpoint}/${key}`);
  url.searchParams.set("X-Amz-Expires", "86400");
  const signed = await client.sign(new Request(url, { method: "GET" }), { aws: { signQuery: true, datetime } });
  return signed.url;
}
