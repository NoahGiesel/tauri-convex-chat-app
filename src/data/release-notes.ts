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
        "New “Start at login” switch in Preferences, off by default: Chat starts by itself when you sign in to your computer; on Windows it starts hidden in the notification area",
      ],
      it: [
        "Nuovo interruttore «Avvia all'accesso» nelle Preferenze, spento di default: Chat si avvia da sola quando accedi al computer; su Windows parte nascosta nell'area di notifica",
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
