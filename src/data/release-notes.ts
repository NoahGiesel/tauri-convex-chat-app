/** Novità per versione, dalla più recente. Le lingue senza testo proprio usano l'inglese. */
export interface ReleaseNote {
  /** Numero di versione, oppure "next" per ciò che è già pronto ma non ancora rilasciato. */
  version: string;
  items: { en: string[]; it?: string[] };
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "next",
    items: {
      en: [
        "Geo Duel: type /geo in a direct chat, pick Italy, Europe or World and 3 or 5 Rounds, and challenge a friend on the same places. Each of you plays a Run whenever you like within 24 hours: in every Round the name of a place appears and you have 60 seconds to click where it is on a map with no names. The closer you click, the more points; the result shows up in the chat and in the Games tab",
      ],
      it: [
        "Geo Duel: scrivi /geo in una chat diretta, scegli Italia, Europa o Mondo e 3 o 5 round, e sfida un amico sugli stessi posti. Ognuno gioca la sua Run quando vuole, entro 24 ore: a ogni round compare il nome di un posto e hai 60 secondi per cliccare dov'è su una mappa senza nomi. Più clicchi vicino, più punti; il risultato arriva in chat e nella scheda Giochi",
      ],
    },
  },
  {
    version: "0.1.35",
    items: {
      en: [
        "A team pinned while it is playing shows that match even when it is not in the team's own league, such as a national team in the Nations League or a club in a cup",
        "New “Start at login” switch in Preferences, off by default: Chat starts by itself when you sign in to your computer; on Windows it starts hidden in the notification area",
      ],
      it: [
        "Una squadra pinnata mentre sta giocando mostra quella partita anche quando non è del suo campionato, come una nazionale in Nations League o un club in una coppa",
        "Nuovo interruttore «Avvia all'accesso» nelle Preferenze, spento di default: Chat si avvia da sola quando accedi al computer; su Windows parte nascosta nell'area di notifica",
      ],
    },
  },
  {
    version: "0.1.34",
    items: {
      en: [
        "The match drawer opens beside the chat, which narrows so messages and the message box stay visible; it stays open until you close it, follows the team to its next match, and each chat remembers its own drawer",
        "The Match tab of the drawer draws both lineups on one pitch, with each player's goals, cards and substitutions, the bench with whoever came on, a centred timeline of events and the stats",
        "The Matches tab of the drawer lists the team's next three matches and its last ten results, each with its competition and a W/D/L badge",
        "A finished match in the Matches tab opens its details in the Match tab, with a Back link to the team's current match",
        "The Standings tab of the drawer shows a table for each competition the team plays this season, with its group in a group stage, its path in a cup and the knockout rounds once the league phase is over",
        "In a derby, the Matches and Standings tabs of the drawer switch between the two pinned teams with a two-crest switch that opens on the team pinned first, and the competition stays if the other team plays it too, otherwise it falls back to the derby's competition",
      ],
      it: [
        "Il drawer della partita si apre accanto alla chat, che si restringe per lasciare visibili i messaggi e il campo di scrittura; resta aperto finché non lo chiudi, segue la squadra alla partita successiva e ogni chat ricorda il proprio drawer",
        "Il tab Partita del drawer disegna le due formazioni su un solo campo, con gol, cartellini e sostituzioni di ogni giocatore, la panchina con chi è entrato, gli eventi su una linea centrale e le statistiche",
        "Il tab Partite del drawer elenca le prossime tre partite della squadra e gli ultimi dieci risultati, ognuno con la competizione e il badge V/N/P",
        "Una partita finita nel tab Partite apre i suoi dettagli nel tab Partita, con un link per tornare alla partita attuale della squadra",
        "Il tab Classifica del drawer mostra la tabella di ogni competizione della squadra in questa stagione, con il suo girone in una fase a gironi, il suo percorso in una coppa e i turni a eliminazione quando la fase campionato è finita",
        "In un derby, i tab Partite e Classifica del drawer passano da una squadra pinnata all'altra con uno scambio di due stemmi che si apre sulla squadra pinnata per prima, e la competizione resta se anche l'altra squadra la gioca, altrimenti torna a quella del derby",
      ],
    },
  },
  {
    version: "0.1.33",
    items: {
      en: ["A team pin keeps showing the match being played instead of jumping ahead to the team's following fixture"],
      it: ["La squadra pinnata continua a mostrare la partita in corso invece di passare a quella successiva"],
    },
  },
  {
    version: "0.1.31",
    items: {
      en: [
        "Team pins: type /calcio and a team name in a direct chat to pin up to three football teams at the top of the chat. Each shows its next match, the live score and the final score, and a click opens goals, cards, lineups and stats",
      ],
      it: [
        "Squadre pinnate: scrivi /calcio e il nome di una squadra in una chat diretta per fissare fino a tre squadre in cima alla chat. Ognuna mostra la prossima partita, il risultato in diretta e quello finale, e con un clic vedi gol, cartellini, formazioni e statistiche",
      ],
    },
  },
  {
    version: "0.1.30",
    items: {
      en: ["Pin messages in a chat or group: pinned messages are visible to everyone and only the person who pinned one can unpin it"],
      it: ["Puoi pinnare messaggi in una chat o in un gruppo: i messaggi pinnati li vedono tutti e solo chi li ha pinnati può rimuovere il pin"],
    },
  },
  {
    version: "0.1.29",
    items: {
      en: ["Wordle Duel tiles keep the same colours in every theme: green for the right letter in the right place, yellow for a letter in the wrong place, red for a letter not in the word"],
      it: ["Le caselle del Wordle Duel hanno gli stessi colori in ogni tema: verde per la lettera al posto giusto, giallo per la lettera al posto sbagliato, rosso per la lettera che non c'è"],
    },
  },
  {
    version: "0.1.28",
    items: {
      en: [
        "Wordle Duel: type /wordle in a direct chat to challenge a friend on the same five-letter word, in Italian or English. Each of you plays a timed Run (1, 5 or 10 minutes) whenever you like within 24 hours, and the card shows the result once you have both finished, or when the Duel closes: fewer guesses wins, then the faster Run",
      ],
      it: [
        "Wordle Duel: scrivi /wordle in una chat diretta per sfidare un amico sulla stessa parola di cinque lettere, in italiano o in inglese. Ognuno gioca quando vuole, entro 24 ore, una Run a tempo (1, 5 o 10 minuti), e la scheda mostra il risultato quando avete finito entrambi, o quando il Duel si chiude: vince chi usa meno tentativi, poi la Run più veloce",
      ],
    },
  },
  {
    version: "0.1.23",
    items: {
      en: [
        "“Get summary” moves into the hover toolbar next to the add-reaction smile (YouTube and Spotify cards keep their own icon)",
        "Uploaded images sit in a small bordered card; a spinner shows while older messages load",
        "Click a profile picture in someone's profile to see it large; new profile pictures are saved in higher quality",
        "On Windows, the X hides the window in the notification area instead of closing the app, so messages keep coming in; the icon shows a red dot when there are unread messages; click it to reopen the window, or choose “Quit” from its menu to close the app",
      ],
      it: [
        "«Ottieni riassunto» passa nella barra al passaggio del mouse, accanto alla faccina delle reazioni (le card di YouTube e Spotify mantengono la loro icona)",
        "Le immagini caricate stanno in una piccola card con bordo; uno spinner compare mentre si caricano i messaggi più vecchi",
        "Clicca la foto nel profilo di qualcuno per vederla in grande; le nuove foto profilo vengono salvate in qualità migliore",
        "Su Windows la X nasconde la finestra nell'area di notifica invece di chiudere l'app, così i messaggi continuano ad arrivare; l'icona mostra un bollino rosso se ci sono messaggi non letti; clic sull'icona per riaprire la finestra, «Esci» dal suo menu per chiudere l'app",
      ],
    },
  },
  {
    version: "0.1.22",
    items: {
      en: [
        "Messages made only of emoji are shown larger: 1.6× for several, 4× for a single one",
        "On macOS, after an update the app reopens from the same place, so the Dock keeps a single icon",
      ],
      it: [
        "I messaggi fatti solo di emoji si vedono più grandi: 1,6 volte se sono più d'una, 4 volte se è una sola",
        "Su macOS, dopo un aggiornamento l'app si riapre dallo stesso posto, così nel Dock resta una sola icona",
      ],
    },
  },
  {
    version: "0.1.21",
    items: {
      en: [
        "Ping indicator next to your status, under your avatar, next to the paperclip or at the bottom left or right of the sidebar (green under 100 ms, orange up to 350 ms, red above); choose where to show it, or hide it, in Preferences",
      ],
      it: [
        "Indicatore del ping accanto allo stato, sotto l'avatar, accanto alla graffetta o in fondo alla sidebar a sinistra o a destra (verde sotto 100 ms, arancione fino a 350 ms, rosso oltre); dalle Preferenze scegli dove mostrarlo o nasconderlo",
      ],
    },
  },
  {
    version: "0.1.17",
    items: {
      en: [
        "YouTube and Spotify links play right inside the chat, and the player can be resized by dragging its corner; pasted “Embed” code from Spotify or YouTube shows the player too",
        "When a link or video can't be summarized, the button is replaced by a message for everyone",
        "New game: /stone-paper-scissors challenges the other person in a direct chat to a best-of-3 with a countdown every round",
        "New game: /quiz3 and /quiz5 — each player picks 3 or 5 topics (or “Random”), the AI writes one question per topic, and you both answer against a countdown; the right answer turns green and the score updates",
        "New “Games” tab in the chat's media with results and statistics",
      ],
      it: [
        "I link di YouTube e Spotify si riproducono direttamente in chat, e il player si ridimensiona trascinando l'angolo; anche il codice «Incorpora» incollato da Spotify o YouTube mostra il player",
        "Quando un link o un video non si può riassumere, il bottone viene sostituito da un messaggio per tutti",
        "Nuovo gioco: /stone-paper-scissors sfida l'altra persona in una chat diretta a una partita al meglio di 3, con un conto alla rovescia a ogni round",
        "Nuovo gioco: /quiz3 e /quiz5 — ognuno sceglie 3 o 5 argomenti (o «Casuale»), l'AI scrive una domanda per argomento e rispondete a tempo; la risposta giusta diventa verde e il punteggio si aggiorna",
        "Nuova scheda «Giochi» nei media della chat con risultati e statistiche",
      ],
    },
  },
  {
    version: "0.1.16",
    items: {
      en: [
        "/ask answers cite their sources as short numbered links at the end of each paragraph, with a hover popup to copy the full link",
        "Edit a group straight from the sidebar: a pencil appears when you hover it",
        "Delete a group (only its creator can), with a double confirmation",
        "Public and private groups: public ones can be found under “Browse groups” and joined by anyone; private ones show a lock in the sidebar",
        "Add and remove group members at any time, and leave a group",
        "Release notes and the app version in the sidebar",
        "After an update, a window shows what's new in the installed version",
      ],
      it: [
        "Le risposte di /ask citano le fonti con link brevi numerati a fine paragrafo, con popup al passaggio del mouse per copiare il link completo",
        "Modifica un gruppo direttamente dalla sidebar: al passaggio del mouse compare una matita",
        "Elimina un gruppo (solo chi lo ha creato), con doppia conferma",
        "Gruppi pubblici e privati: quelli pubblici si trovano in «Esplora gruppi» e chiunque può unirsi; quelli privati hanno un lucchetto nella sidebar",
        "Aggiungi e rimuovi membri di un gruppo in qualsiasi momento, ed esci da un gruppo",
        "Note di rilascio e versione dell'app nella sidebar",
        "Dopo un aggiornamento una finestra mostra le novità della versione installata",
      ],
    },
  },
  {
    version: "0.1.15",
    items: {
      en: [
        "“Transcribe” is now “Get summary”",
        "Unread badge no longer disappears right away when the app is in the background",
        "Improvements to the summary feature in the conversation view",
      ],
      it: [
        "«Trascrivi» ora è «Ottieni riassunto»",
        "Il badge dei non letti non sparisce più subito quando l'app è in secondo piano",
        "Miglioramenti alla funzione di riassunto nella conversazione",
      ],
    },
  },
  {
    version: "0.1.14",
    items: {
      en: ["AI helper: summaries of links and long texts, /ask with web search, AI usage in Settings", "Link browser and preferences"],
      it: ["AI helper: riassunti di link e testi lunghi, /ask con ricerca sul web, utilizzo AI nelle Impostazioni", "Browser per i link e preferenze"],
    },
  },
  {
    version: "0.1.13",
    items: { en: ["New notification sounds"], it: ["Nuovi suoni di notifica"] },
  },
  {
    version: "0.1.12",
    items: { en: ["Notification badge on the Windows taskbar icon"], it: ["Badge delle notifiche sull'icona nella barra di Windows"] },
  },
  {
    version: "0.1.11",
    items: {
      en: ["Rename groups and give them an icon", "Notification settings and online/offline status", "Layout polish in the chat list"],
      it: ["Rinomina i gruppi e dai loro un'icona", "Impostazioni delle notifiche e stato online/offline", "Ritocchi al layout della lista chat"],
    },
  },
  {
    version: "0.1.10",
    items: { en: ["Messaging improvements and UI polish"], it: ["Miglioramenti ai messaggi e ritocchi all'interfaccia"] },
  },
  {
    version: "0.1.9",
    items: {
      en: ["“is typing…” indicator", "Profile modal: see details of a person and edit your own"],
      it: ["Indicatore «sta scrivendo…»", "Profilo: guarda i dettagli di una persona e modifica il tuo"],
    },
  },
  {
    version: "0.1.8",
    items: { en: ["Adjustable corner roundness"], it: ["Arrotondamento degli angoli regolabile"] },
  },
];
