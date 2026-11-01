/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
  readonly VITE_CONVEX_SITE_URL: string;
  /** Chiave API di GIPHY per cercare le GIF (facoltativa: senza, il pulsante GIF spiega cosa manca). */
  readonly VITE_GIPHY_API_KEY?: string;
  /** Presente solo nella build di test della suite E2E. */
  readonly VITE_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
