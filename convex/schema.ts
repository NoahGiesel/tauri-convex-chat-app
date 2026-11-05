import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** Una Run del Wordle Duel: si salvano solo le parole, i colori li calcola il server dalla parola. */
const wordleRun = v.object({
  startedAt: v.number(),
  /** `startedAt` più il Run timer: il tempo non si ferma mai. */
  endsAt: v.number(),
  guesses: v.array(v.string()),
  endedAt: v.optional(v.number()),
  endReason: v.optional(v.union(v.literal("solved"), v.literal("missed"), v.literal("timeout"), v.literal("gaveUp"))),
});

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
    /** Si mostra offline agli altri: il segnale di presenza non si aggiorna. */
    invisible: v.optional(v.boolean()),
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
    /** Solo gruppi: emoji scelta come icona (assente = icona predefinita). */
    icon: v.optional(v.string()),
    /** Solo gruppi: "public" = tutti gli utenti dell'app lo vedono e possono entrare; assente o "private" = solo i membri aggiunti. */
    visibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
    createdBy: v.id("profiles"),
    /** Solo per le chat dirette: la `pairKey` della coppia. */
    directKey: v.optional(v.string()),
    lastMessageAt: v.number(),
  })
    .index("by_directKey", ["directKey"])
    .index("by_visibility", ["visibility"]),

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
    kind: v.union(v.literal("text"), v.literal("ai"), v.literal("gif"), v.literal("media"), v.literal("game")),
    /** Testo cercato con /giphy (solo per kind "gif" inviate col comando). */
    gifQuery: v.optional(v.string()),
    /** Allegato su Cloudflare R2 (solo per kind "media"; `body` contiene il nome del file). */
    /** Allegati del messaggio (foto e video su R2); `body` è la didascalia. Sostituisce `media`, che resta per i messaggi vecchi. */
    attachments: v.optional(
      v.array(
        v.object({
          key: v.string(),
          type: v.union(v.literal("image"), v.literal("video")),
          mime: v.string(),
          size: v.number(),
          name: v.string(),
        }),
      ),
    ),
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
    /** Per i riassunti: il messaggio (link o testo lungo) che è stato riassunto. */
    summaryOf: v.optional(v.id("messages")),
    /** Per i riassunti: "pending" mentre il modello lavora (il testo è ancora vuoto), poi "done". */
    summaryStatus: v.optional(v.union(v.literal("pending"), v.literal("done"))),
    /** Per `kind: "game"`: la partita mostrata dal messaggio. */
    gameId: v.optional(v.id("games")),
    /** Per `kind: "game"`: il quiz mostrato dal messaggio (al posto di `gameId`). */
    quizId: v.optional(v.id("quizzes")),
    /** Per `kind: "game"`: il Wordle Duel mostrato dal messaggio (al posto di `gameId`). */
    wordleDuelId: v.optional(v.id("wordleDuels")),
    /** Il riassunto di questo messaggio non è possibile (link illeggibile, video troppo lungo…): codice dell'errore, valido per tutti. */
    summaryBlocked: v.optional(v.string()),
    /** Per le risposte di /ask: il messaggio con la domanda. */
    askOf: v.optional(v.id("messages")),
    /** Per le risposte di /ask: "pending" finché il modello risponde (il testo è ancora vuoto), poi "done". */
    askStatus: v.optional(v.union(v.literal("pending"), v.literal("done"))),
    /** Per `kind: "ai"`: chi ha lanciato `/ask`. */
    requestedBy: v.optional(v.id("profiles")),
    /** true se il messaggio contiene link (alimenta l'elenco "Media e link"); assente altrimenti. */
    hasLink: v.optional(v.boolean()),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_and_kind", ["conversationId", "kind"])
    .index("by_conversation_and_hasLink", ["conversationId", "hasLink"])
    .index("by_summaryOf", ["summaryOf"]),

  /** Partite 1 contro 1 (sasso-carta-forbici al meglio di 3) giocate in una chat diretta. */
  games: defineTable({
    conversationId: v.id("conversations"),
    /** Chi ha lanciato la sfida. */
    playerA: v.id("profiles"),
    playerB: v.id("profiles"),
    status: v.union(v.literal("invite"), v.literal("playing"), v.literal("done"), v.literal("declined"), v.literal("cancelled")),
    scoreA: v.number(),
    scoreB: v.number(),
    /** Round già giocati, in ordine. `winner`: "a" = chi ha sfidato, "b" = lo sfidato. */
    rounds: v.array(
      v.object({
        a: v.optional(v.union(v.literal("stone"), v.literal("paper"), v.literal("scissors"))),
        b: v.optional(v.union(v.literal("stone"), v.literal("paper"), v.literal("scissors"))),
        winner: v.union(v.literal("a"), v.literal("b"), v.literal("draw")),
      }),
    ),
    /** Mosse del round in corso: restano segrete finché il round non si chiude. */
    pickA: v.optional(v.union(v.literal("stone"), v.literal("paper"), v.literal("scissors"))),
    pickB: v.optional(v.union(v.literal("stone"), v.literal("paper"), v.literal("scissors"))),
    /** Fine del conto alla rovescia del round in corso. */
    endsAt: v.optional(v.number()),
    /** Quando finisce la pausa col risultato e parte il round dopo. */
    nextRoundAt: v.optional(v.number()),
    winnerId: v.optional(v.id("profiles")),
    finishedAt: v.optional(v.number()),
  }).index("by_conversation", ["conversationId"]),

  /** Quiz 1 contro 1: ognuno dà 3 o 5 argomenti, l'AI scrive una domanda per argomento, si risponde a tempo. */
  quizzes: defineTable({
    conversationId: v.id("conversations"),
    /** Chi ha lanciato la sfida. */
    playerA: v.id("profiles"),
    playerB: v.id("profiles"),
    /** Argomenti a testa (3 o 5): le domande sono il doppio. */
    size: v.number(),
    /** Lingua delle domande (quella dell'app di chi ha sfidato). */
    language: v.string(),
    status: v.union(
      v.literal("setup"),
      v.literal("invite"),
      v.literal("generating"),
      v.literal("playing"),
      v.literal("done"),
      v.literal("declined"),
      v.literal("cancelled"),
      v.literal("failed"),
    ),
    topicsA: v.array(v.string()),
    topicsB: v.array(v.string()),
    /** Il giocatore ha scelto "casuale": gli argomenti li decide l'AI. */
    randomA: v.optional(v.boolean()),
    randomB: v.optional(v.boolean()),
    /** Domande in ordine di gioco (argomenti di A e B alternati), con la risposta giusta. */
    questions: v.array(v.object({ topic: v.string(), text: v.string(), options: v.array(v.string()), correct: v.number() })),
    /** Round già chiusi: l'opzione scelta da ciascuno (assente = nessuna risposta). */
    answers: v.array(v.object({ a: v.optional(v.number()), b: v.optional(v.number()) })),
    scoreA: v.number(),
    scoreB: v.number(),
    /** Risposte del round in corso: restano segrete finché il round non si chiude. */
    pickA: v.optional(v.number()),
    pickB: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    nextRoundAt: v.optional(v.number()),
    winnerId: v.optional(v.id("profiles")),
    finishedAt: v.optional(v.number()),
  }).index("by_conversation", ["conversationId"]),

  /** Wordle Duel 1 contro 1 in una chat diretta: la stessa parola segreta, una Run a testa, in qualsiasi momento. */
  wordleDuels: defineTable({
    conversationId: v.id("conversations"),
    /** Chi ha lanciato la sfida (A). */
    playerA: v.id("profiles"),
    playerB: v.id("profiles"),
    /** Run timer, in minuti. */
    runMinutes: v.union(v.literal(1), v.literal(5), v.literal(10)),
    language: v.union(v.literal("it"), v.literal("en")),
    /** La parola: nessuna query la restituisce finché il Duel non è chiuso. */
    word: v.string(),
    /** `expired` vale per l'invito senza risposta (senza `acceptedAt`) e per il Duel che nessuno ha finito (con `acceptedAt`). */
    status: v.union(
      v.literal("invite"),
      v.literal("open"),
      v.literal("closed"),
      v.literal("declined"),
      v.literal("withdrawn"),
      v.literal("expired"),
    ),
    createdAt: v.number(),
    acceptedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    /** Esito del Duel chiuso: chi vince (assente = pareggio) e perché. */
    outcome: v.optional(
      v.object({
        winner: v.optional(v.id("profiles")),
        reason: v.union(
          v.literal("fewerGuesses"),
          v.literal("fasterRun"),
          v.literal("onlyOneGuessed"),
          v.literal("forfeit"),
          v.literal("neitherGuessed"),
        ),
      }),
    ),
    runA: v.optional(wordleRun),
    runB: v.optional(wordleRun),
  })
    .index("by_conversation_and_status", ["conversationId", "status"])
    .index("by_conversation_and_language", ["conversationId", "language"]),

  /** Anteprime dei link (Open Graph), condivise da tutti: si scaricano una volta sola per indirizzo. */
  linkPreviews: defineTable({
    url: v.string(),
    /** false se la pagina non si è potuta leggere (si riprova dopo un'ora). */
    ok: v.boolean(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    image: v.optional(v.string()),
    siteName: v.optional(v.string()),
    fetchedAt: v.number(),
  }).index("by_url", ["url"]),

  /** Chi sta scrivendo in una chat: una riga per persona e conversazione, con la scadenza dell'indicatore. */
  typing: defineTable({
    conversationId: v.id("conversations"),
    profileId: v.id("profiles"),
    until: v.number(),
  }).index("by_conversation_and_profile", ["conversationId", "profileId"]),

  /** Trascrizioni già fatte, per contenuto e lingua: lo stesso link o testo non si ritrascrive mai (si riusa quella salvata). */
  transcripts: defineTable({
    key: v.string(),
    body: v.string(),
  }).index("by_key", ["key"]),
});
