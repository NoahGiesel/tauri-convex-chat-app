# Chat desktop (Tauri 2 + React + shadcn + Convex + Better Auth)

Stato: **scheletro con auto-update funzionante**. La chat (Convex + Better Auth) è il prossimo passo.

## Setup iniziale (una volta sola)

```bash
# 1. Prerequisiti: Node 22+, Rust (https://rustup.rs), su macOS gli Xcode CLT
npm install            # genera anche package-lock.json: committalo (serve alla CI)

# 2. UI: shadcn (rileva Vite + alias "@/")
npx shadcn@latest init
npx shadcn@latest add button card progress

# 3. Icone (serve un PNG quadrato ≥ 1024px)
npx tauri icon ./app-icon.png

# 4. Prova in locale
npm run tauri:dev
```

## Auto-update: configurazione

1. **Chiave di firma** (gratis, tua):
   ```bash
   npx tauri signer generate -w ~/.tauri/chat.key
   ```
   Metti la **chiave pubblica** in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.
2. **Segreti GitHub** (Settings → Secrets and variables → Actions):
   - `TAURI_SIGNING_PRIVATE_KEY` = contenuto di `~/.tauri/chat.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = la password scelta (anche vuota)
3. Sostituisci `OWNER/REPO` in `tauri.conf.json` (endpoint e `identifier`).
4. La repo deve essere **pubblica**, così l'updater scarica `latest.json` senza autenticazione.
   Conserva la chiave privata: se la perdi, le app già installate non potranno più aggiornarsi.

## Rilasciare una nuova versione

```bash
npm version patch          # aggiorna package.json (tauri.conf.json la legge da lì) e crea il tag
git push --follow-tags     # la CI compila macOS + Windows e pubblica la Release con latest.json
```

Le app installate controllano all'avvio, ogni 30 minuti e quando la finestra torna in primo piano.
Se c'è una versione nuova: notifica desktop (una per versione) + banner in alto + pagina
Impostazioni › Aggiornamenti con note di rilascio, barra di progresso e riavvio automatico.

## Note

- La **prima** installazione richiede di aggirare Gatekeeper (macOS: tasto destro › Apri) e
  SmartScreen (Windows: "Esegui comunque"), perché i binari non sono firmati con certificati a pagamento.
  Gli aggiornamenti successivi passano dall'updater e non mostrano di nuovo l'avviso.
- In `tauri dev` il controllo aggiornamenti non trova nulla: va provato con una build installata
  (installa la v0.1.0, rilascia la v0.1.1, aspetta la notifica).
