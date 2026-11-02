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
        "Choose which browser opens links (Settings › Preferences)",
        "New Preferences section: language and link browser",
        "/ask answers cite their sources as short numbered links at the end of each paragraph, with a hover popup to copy the full link",
        "Unread badge no longer disappears right away when the app is in the background",
        "“Transcribe” is now “Get summary”",
        "Edit a group straight from the sidebar: a pencil appears when you hover it",
        "Delete a group (only its creator can), with a double confirmation",
        "Public and private groups: public ones can be found under “Browse groups” and joined by anyone; private ones show a lock in the sidebar",
        "Add and remove group members at any time, and leave a group",
        "Release notes and the app version in the sidebar",
        "After an update, a window shows what's new in the installed version",
      ],
      it: [
        "Scegli in quale browser aprire i link (Impostazioni › Preferenze)",
        "Nuova sezione Preferenze: lingua e browser per i link",
        "Le risposte di /ask citano le fonti con link brevi numerati a fine paragrafo, con popup al passaggio del mouse per copiare il link completo",
        "Il badge dei non letti non sparisce più subito quando l'app è in secondo piano",
        "«Trascrivi» ora è «Ottieni riassunto»",
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
      en: ["Improvements to the summary feature in the conversation view"],
      it: ["Miglioramenti alla funzione di riassunto nella conversazione"],
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
