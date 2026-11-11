import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** Run timer del Wordle Duel, in minuti, e lingua della parola: li usano anche le funzioni in `wordleDuels.ts`. */
export const wordleRunMinutes = v.union(v.literal(1), v.literal(5), v.literal(10));
export const wordleLanguage = v.union(v.literal("it"), v.literal("en"));

/** Una Run del Wordle Duel: si salvano solo le parole, i colori li calcola il server dalla parola. */
const wordleRun = v.object({
  startedAt: v.number(),
  /** `startedAt` più il Run timer: il tempo non si ferma mai. */
  endsAt: v.number(),
  guesses: v.array(v.string()),
  endedAt: v.optional(v.number()),
  endReason: v.optional(v.union(v.literal("solved"), v.literal("missed"), v.literal("timeout"), v.literal("gaveUp"))),
});

/** Una delle due squadre di una partita, con quanto serve per mostrarla anche se non è nell'indice. */
const footballSide = v.object({
  teamId: v.string(),
  name: v.string(),
  shortName: v.string(),
  abbreviation: v.string(),
  logo: v.optional(v.string()),
});

const footballSideKey = v.union(v.literal("home"), v.literal("away"));
/** Una partita del calendario di una squadra, alleggerita: la riga del tab Partite (docs/MATCH-DRAWER-SPEC.md). */
export const footballScheduleMatch = v.object({
  eventId: v.string(),
  kickoff: v.number(),
  /** Slug ESPN della competizione (es. "ita.1"). */
  league: v.string(),
  /** Il nome corto della competizione dato da ESPN (es. "Serie A"). */
  leagueName: v.string(),
  /** Il turno ESPN (es. "Round of 16"); in campionato ripete la stagione. */
  round: v.string(),
  opponent: footballSide,
  /** true se la partita si gioca in casa. */
  home: v.boolean(),
  score: v.optional(v.object({ home: v.number(), away: v.number() })),
  shootout: v.optional(v.object({ home: v.number(), away: v.number() })),
  /** Il lato che ESPN dà vincente: dopo i rigori è chi li ha vinti. */
  winner: v.optional(footballSideKey),
  state: v.union(v.literal("pre"), v.literal("in"), v.literal("post")),
  /** Nome ESPN dello stato (es. "STATUS_FINAL_AET"): l'intestazione di una partita vecchia lo usa. */
  statusName: v.optional(v.string()),
  /** false quando ESPN non ha ancora fissato il calcio d'inizio (il tab mostra solo la data). */
  timeValid: v.optional(v.boolean()),
});

/** Una riga della classifica di una competizione (docs/MATCH-DRAWER-SPEC.md, `footballStandings`). */
export const footballStandingsRow = v.object({
  rank: v.number(),
  teamId: v.string(),
  name: v.string(),
  shortName: v.string(),
  logo: v.optional(v.string()),
  played: v.number(),
  goalDifference: v.number(),
  points: v.number(),
  /** La zona di ESPN, pulita: il colore senza `#` e l'etichetta senza spazi di troppo. */
  zone: v.optional(v.object({ color: v.string(), label: v.string() })),
});

/** Un girone (uno solo per un campionato), con le righe già ordinate per posizione. */
export const footballStandingsGroup = v.object({
  name: v.string(),
  rows: v.array(footballStandingsRow),
});

/** Una competizione della squadra in questa stagione, ricavata dal calendario. */
export const footballCompetition = v.object({
  league: v.string(),
  name: v.string(),
  shortName: v.string(),
  season: v.string(),
});

/** Un giocatore in formazione: `row` e `order` solo per i titolari, quando il riassunto dà i posti in campo. */
const lineupPlayer = v.object({
  name: v.string(),
  jersey: v.optional(v.string()),
  /** Id ESPN dell'atleta: aggancia gli eventi al giocatore. */
  athleteId: v.optional(v.string()),
  shortName: v.optional(v.string()),
  /** La fila dal fondo (0 è il portiere) e la posizione nella fila da sinistra. */
  row: v.optional(v.number()),
  order: v.optional(v.number()),
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

  /** Messaggi pinnati in una chat o in un gruppo: li vedono tutti i membri, li toglie solo chi li ha pinnati. */
  pins: defineTable({
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    pinnedBy: v.id("profiles"),
    pinnedAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_message", ["messageId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    /** Assente per le risposte dell'AI locale. */
    authorId: v.optional(v.id("profiles")),
    /** Quando l'autore ha modificato il testo; assente se il messaggio è originale. */
    editedAt: v.optional(v.number()),
    kind: v.union(v.literal("text"), v.literal("ai"), v.literal("gif"), v.literal("media"), v.literal("game"), v.literal("system")),
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
    /**
     * Per `kind: "system"`: le parti della riga di sistema ("📌 Stefan ha pinnato Inter"), che ogni client
     * scrive nella sua lingua. Una riga di sistema non ha autore, non conta come non letta e non sposta la chat.
     */
    system: v.optional(
      v.object({
        action: v.union(v.literal("pinned"), v.literal("unpinned")),
        profileId: v.id("profiles"),
        teamName: v.string(),
      }),
    ),
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
    runMinutes: wordleRunMinutes,
    language: wordleLanguage,
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

  /**
   * Indice delle squadre per `/calcio`: i club delle competizioni coperte e tutte le nazionali,
   * ricostruito ogni settimana dalle liste ESPN (vedi docs/TEAM-PINS-SPEC.md).
   */
  footballTeams: defineTable({
    /** Id ESPN della squadra: è lo stesso in ogni competizione. */
    teamId: v.string(),
    name: v.string(),
    shortName: v.string(),
    abbreviation: v.string(),
    logo: v.optional(v.string()),
    /** Competizione da mostrare nel picker (es. "Serie A"); assente per le nazionali. */
    competition: v.optional(v.string()),
    national: v.boolean(),
    /** Nomi normalizzati (senza accenti, minuscoli) più gli alias, per la ricerca. */
    keys: v.array(v.string()),
    /** false se la squadra non è più nelle liste ESPN: resta per i pin già messi, ma non si cerca. */
    listed: v.boolean(),
    /** Solo per le squadre pinnate: l'ultima partita giocata e la prossima (assente se non ce n'è una in programma). */
    lastMatchId: v.optional(v.id("footballMatches")),
    nextMatchId: v.optional(v.id("footballMatches")),
  })
    .index("by_teamId", ["teamId"])
    .index("by_listed", ["listed"])
    .index("by_lastMatchId", ["lastMatchId"])
    .index("by_nextMatchId", ["nextMatchId"]),

  /** Le squadre di calcio pinnate in una chat diretta, al massimo 3 per chat (docs/TEAM-PINS-SPEC.md). */
  teamPins: defineTable({
    conversationId: v.id("conversations"),
    /** Id ESPN della squadra, come in `footballTeams`. */
    teamId: v.string(),
    pinnedBy: v.id("profiles"),
    pinnedAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_and_teamId", ["conversationId", "teamId"])
    .index("by_teamId", ["teamId"]),

  /** Una riga per partita ESPN, condivisa da tutte le chat che pinnano una delle due squadre. */
  footballMatches: defineTable({
    eventId: v.string(),
    /** Slug ESPN della competizione (es. "ita.1"): serve per chiedere il tabellone giusto. */
    league: v.string(),
    home: footballSide,
    away: footballSide,
    kickoff: v.number(),
    /** `pre`, `in` o `post`: decide se la partita va seguita. */
    state: v.union(v.literal("pre"), v.literal("in"), v.literal("post")),
    /** Nome ESPN dello stato (es. "STATUS_HALFTIME"): decide l'etichetta. */
    statusName: v.string(),
    score: v.optional(v.object({ home: v.number(), away: v.number() })),
    shootout: v.optional(v.object({ home: v.number(), away: v.number() })),
    /** Minuto mostrato da ESPN (es. "67'"). */
    clock: v.optional(v.string()),
    /** Una partita vecchia aperta dal drawer: quando ne è stato chiesto il riassunto (docs/MATCH-DRAWER-SPEC.md, Older matches). */
    detailsRequestedAt: v.optional(v.number()),
    fetchedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    // Il giro dei 30 secondi cerca le partite in corso e quelle che stanno per iniziare; la pulizia quelle finite da tempo.
    .index("by_state_and_kickoff", ["state", "kickoff"]),

  /** Eventi, formazioni e statistiche di una partita per il drawer: una copia alleggerita del riassunto ESPN. */
  footballMatchDetails: defineTable({
    matchId: v.id("footballMatches"),
    competition: v.optional(v.string()),
    venue: v.optional(v.string()),
    /** `player` è chi segna, è ammonito o entra; `other` chi fa l'assist o esce. */
    events: v.array(
      v.object({
        kind: v.union(
          v.literal("goal"),
          v.literal("penaltyGoal"),
          v.literal("ownGoal"),
          v.literal("yellowCard"),
          v.literal("redCard"),
          v.literal("substitution"),
        ),
        minute: v.string(),
        side: footballSideKey,
        player: v.optional(v.string()),
        other: v.optional(v.string()),
        /** Id ESPN dei due giocatori: `player` chi segna, è ammonito o entra; `other` chi fa l'assist o esce. */
        playerId: v.optional(v.string()),
        otherId: v.optional(v.string()),
      }),
    ),
    lineups: v.array(
      v.object({
        side: footballSideKey,
        formation: v.optional(v.string()),
        /** Il colore della squadra da ESPN (es. "00239c"), senza `#`: riempie il cerchio in campo. */
        color: v.optional(v.string()),
        starters: v.array(lineupPlayer),
        bench: v.array(lineupPlayer),
      }),
    ),
    stats: v.array(
      v.object({
        key: v.union(
          v.literal("possession"),
          v.literal("shots"),
          v.literal("shotsOnTarget"),
          v.literal("corners"),
          v.literal("fouls"),
          v.literal("offsides"),
        ),
        home: v.number(),
        away: v.number(),
      }),
    ),
    fetchedAt: v.number(),
  }).index("by_matchId", ["matchId"]),

  /**
   * Il calendario di una squadra pinnata: i risultati della stagione in corso, le partite in programma e le
   * competizioni, in una riga per squadra condivisa da tutte le chat (docs/MATCH-DRAWER-SPEC.md).
   */
  footballTeamSchedules: defineTable({
    teamId: v.string(),
    results: v.array(footballScheduleMatch),
    fixtures: v.array(footballScheduleMatch),
    competitions: v.array(footballCompetition),
    fetchedAt: v.number(),
  }).index("by_teamId", ["teamId"]),

  /**
   * La classifica di una competizione: una riga per slug e stagione, condivisa da ogni chat
   * (docs/MATCH-DRAWER-SPEC.md, `footballStandings`). Una coppa senza tabella non ha gironi.
   */
  footballStandings: defineTable({
    /** Slug ESPN della competizione (es. "ita.1"). */
    league: v.string(),
    /** La stagione, come la scrive ESPN (es. "2026-27 Italian Serie A"). */
    season: v.string(),
    /** La fine della stagione: un campionato finito da anni si riconosce da qui. */
    endDate: v.number(),
    groups: v.array(footballStandingsGroup),
    fetchedAt: v.number(),
  })
    .index("by_league", ["league"])
    .index("by_league_and_season", ["league", "season"]),
});
