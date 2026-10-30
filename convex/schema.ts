import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Gli utenti veri (email, password, sessioni) vivono nel componente Better Auth.
// Qui teniamo il profilo dell'app, collegato all'identità tramite `tokenIdentifier`.
export default defineSchema({
  profiles: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    /** Indice nella palette avatar del tema (art. `avatars` in presets.json). */
    avatarIndex: v.number(),
    lastSeenAt: v.optional(v.number()),
  }).index("by_tokenIdentifier", ["tokenIdentifier"]),

  /** Link d'invito: monouso, con scadenza. Chi lo usa genera una richiesta d'amicizia. */
  invites: defineTable({
    token: v.string(),
    createdBy: v.id("profiles"),
    expiresAt: v.number(),
    redeemedBy: v.optional(v.id("profiles")),
  })
    .index("by_token", ["token"])
    .index("by_createdBy", ["createdBy"]),

  friendships: defineTable({
    requester: v.id("profiles"),
    addressee: v.id("profiles"),
    status: v.union(v.literal("pending"), v.literal("accepted")),
    /** Coppia ordinata `${idMinore}_${idMaggiore}`: una sola riga per coppia. */
    pairKey: v.string(),
  })
    .index("by_pairKey", ["pairKey"])
    .index("by_requester_and_status", ["requester", "status"])
    .index("by_addressee_and_status", ["addressee", "status"]),

  /** Chat 1:1 e gruppi. */
  conversations: defineTable({
    kind: v.union(v.literal("direct"), v.literal("group")),
    name: v.optional(v.string()),
    createdBy: v.id("profiles"),
    /** Solo per le chat dirette: la `pairKey` della coppia. */
    directKey: v.optional(v.string()),
    lastMessageAt: v.number(),
  }).index("by_directKey", ["directKey"]),

  /** Appartenenza a una conversazione, con stato di lettura. */
  members: defineTable({
    conversationId: v.id("conversations"),
    profileId: v.id("profiles"),
    lastReadAt: v.number(),
    /** Copia di `conversations.lastMessageAt`, per ordinare la lista chat di ogni utente. */
    lastMessageAt: v.number(),
  })
    .index("by_profile_and_lastMessageAt", ["profileId", "lastMessageAt"])
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_and_profile", ["conversationId", "profileId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    /** Assente per le risposte dell'AI locale. */
    authorId: v.optional(v.id("profiles")),
    kind: v.union(v.literal("text"), v.literal("ai")),
    body: v.string(),
    /** Per `kind: "ai"`: chi ha lanciato `/ask`. */
    requestedBy: v.optional(v.id("profiles")),
  }).index("by_conversation", ["conversationId"]),
});
