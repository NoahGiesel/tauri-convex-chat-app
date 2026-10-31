import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * Errori che l'utente può vedere: il server manda solo un codice, il client lo traduce
 * nella lingua scelta (chiavi `error.<code>` in src/i18n).
 */
export type ErrorCode =
  | "not_authenticated"
  | "not_member"
  | "invalid_invite"
  | "own_invite"
  | "invalid_name"
  | "bio_too_long"
  | "invalid_image"
  | "user_not_found"
  | "request_not_found"
  | "friendship_not_found"
  | "not_friends"
  | "group_name_length"
  | "group_size"
  | "group_not_friends"
  | "message_empty"
  | "message_too_long";

export const fail = (code: ErrorCode) => new ConvexError({ code });

/** Profilo dell'utente autenticato, o null. L'identità arriva sempre dal server, mai da un argomento. */
export async function getProfile(ctx: QueryCtx): Promise<Doc<"profiles"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("profiles")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireProfile(ctx: QueryCtx): Promise<Doc<"profiles">> {
  const profile = await getProfile(ctx);
  if (!profile) throw fail("not_authenticated");
  return profile;
}

/** I soli campi di un profilo che gli altri utenti possono vedere (mai l'email). */
export const publicProfile = async (ctx: QueryCtx, p: Doc<"profiles">) => ({
  _id: p._id,
  name: p.name,
  avatarIndex: p.avatarIndex,
  avatarUrl: await avatarUrl(ctx, p),
  bio: p.bio ?? null,
  lastSeenAt: p.lastSeenAt,
});

/** Indirizzo della foto profilo, o null se l'utente non ne ha caricata una. */
export async function avatarUrl(ctx: QueryCtx, p: Doc<"profiles">): Promise<string | null> {
  return p.avatarStorageId ? await ctx.storage.getUrl(p.avatarStorageId) : null;
}

/** Chiave stabile per una coppia di profili, indipendente dall'ordine. */
export const pairKey = (a: Id<"profiles">, b: Id<"profiles">): string => (a < b ? `${a}_${b}` : `${b}_${a}`);

export async function areFriends(ctx: QueryCtx, a: Id<"profiles">, b: Id<"profiles">): Promise<boolean> {
  const friendship = await ctx.db
    .query("friendships")
    .withIndex("by_pairKey", (q) => q.eq("pairKey", pairKey(a, b)))
    .unique();
  return friendship?.status === "accepted";
}

/** Verifica che il profilo sia membro della conversazione e restituisce la sua riga. */
export async function requireMember(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
  profileId: Id<"profiles">,
): Promise<Doc<"members">> {
  const member = await ctx.db
    .query("members")
    .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", conversationId).eq("profileId", profileId))
    .unique();
  if (!member) throw fail("not_member");
  return member;
}

/** Restituisce la chat diretta tra due profili, creandola se non esiste. */
export async function ensureDirectConversation(
  ctx: MutationCtx,
  a: Id<"profiles">,
  b: Id<"profiles">,
): Promise<Id<"conversations">> {
  const key = pairKey(a, b);
  const existing = await ctx.db
    .query("conversations")
    .withIndex("by_directKey", (q) => q.eq("directKey", key))
    .unique();
  if (existing) return existing._id;

  const now = Date.now();
  const conversationId = await ctx.db.insert("conversations", {
    kind: "direct",
    createdBy: a,
    directKey: key,
    lastMessageAt: now,
  });
  for (const profileId of [a, b]) {
    await ctx.db.insert("members", { conversationId, profileId, lastReadAt: now, lastMessageAt: now });
  }
  return conversationId;
}
