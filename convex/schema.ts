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
    /** Breve descrizione scritta dall'utente. */
    bio: v.optional(v.string()),
    /** Cartelle personali della barra laterale, con le chat che contengono (nell'ordine scelto). */
    sidebarFolders: v.optional(
      v.array(v.object({ id: v.string(), name: v.string(), chatIds: v.array(v.id("conversations")) })),
    ),
    /** Ordine scelto a mano per le chat fuori dalle cartelle (le chat non elencate restano in cima, per attività). */
    sidebarChatOrder: v.optional(v.array(v.id("conversations"))),
    /** Ordine delle sezioni: "groups", "direct" e gli id delle cartelle. */
    sidebarOrder: v.optional(v.array(v.string())),
    /** Foto profilo caricata (file nello storage di Convex). Senza foto si usa l'iniziale colorata. */
    avatarStorageId: v.optional(v.id("_storage")),
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

  /** Reazioni con emoji ai messaggi: una riga per persona ed emoji. */
  reactions: defineTable({
    messageId: v.id("messages"),
    profileId: v.id("profiles"),
    emoji: v.string(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_and_profile_and_emoji", ["messageId", "profileId", "emoji"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    /** Assente per le risposte dell'AI locale. */
    authorId: v.optional(v.id("profiles")),
    /** Quando l'autore ha modificato il testo; assente se il messaggio è originale. */
    editedAt: v.optional(v.number()),
    kind: v.union(v.literal("text"), v.literal("ai"), v.literal("gif"), v.literal("media")),
    /** Allegato su Cloudflare R2 (solo per kind "media"; `body` contiene il nome del file). */
    media: v.optional(
      v.object({
        key: v.string(),
        type: v.union(v.literal("image"), v.literal("video")),
        mime: v.string(),
        size: v.number(),
      }),
    ),
    /** Come mostrare un messaggio di testo scritto con un comando (/code, /quote…). Per "random" e "flip" il corpo è il risultato. */
    style: v.optional(
      v.union(
        v.literal("me"),
        v.literal("code"),
        v.literal("pre"),
        v.literal("spoiler"),
        v.literal("quote"),
        v.literal("random"),
        v.literal("flip"),
      ),
    ),
    /** Testo del messaggio; per `kind: "gif"` è l'indirizzo della GIF (solo GIPHY). */
    body: v.string(),
    /** Per `kind: "ai"`: chi ha lanciato `/ask`. */
    requestedBy: v.optional(v.id("profiles")),
  }).index("by_conversation", ["conversationId"]),
});
