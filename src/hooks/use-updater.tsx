import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "error";

interface UpdaterContextValue {
  status: UpdaterStatus;
  /** Versione disponibile (se status = available | downloading). */
  version: string | null;
  /** Note di rilascio (corpo della GitHub Release). */
  notes: string | null;
  /** 0..1 durante il download, null se la dimensione non è nota. */
  progress: number | null;
  error: string | null;
  lastChecked: Date | null;
  /** Il banner è stato chiuso per questa versione. */
  dismissed: boolean;
  /** `manual = true` mostra anche gli errori e il "sei aggiornato". */
  checkNow: (manual?: boolean) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

const UpdaterContext = createContext<UpdaterContextValue | null>(null);

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // ogni 30 minuti
const FOCUS_THROTTLE_MS = 10 * 60 * 1000; // al focus, se l'ultimo check è > 10 min fa
const FIRST_CHECK_DELAY_MS = 3000;
const NOTIFIED_KEY = "updater:lastNotifiedVersion";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function notifyUpdateAvailable(version: string) {
  try {
    if (localStorage.getItem(NOTIFIED_KEY) === version) return; // una sola volta per versione
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (!granted) return;
    sendNotification({
      title: "Aggiornamento disponibile",
      body: `La versione ${version} è pronta. Apri Impostazioni › Aggiornamenti per installarla.`,
    });
    localStorage.setItem(NOTIFIED_KEY, version);
  } catch {
    // Le notifiche sono un di più: non devono mai rompere l'updater.
  }
}

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdaterStatus>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  const updateRef = useRef<Update | null>(null);
  const busyRef = useRef(false); // evita check/download sovrapposti
  const lastCheckRef = useRef(0);

  const checkNow = useCallback(async (manual = false) => {
    if (!isTauri() || busyRef.current) return;
    busyRef.current = true;
    lastCheckRef.current = Date.now();
    setStatus("checking");
    setError(null);
    try {
      const update = await check();
      setLastChecked(new Date());
      if (update) {
        updateRef.current = update;
        setVersion(update.version);
        setNotes(update.body ?? null);
        setStatus("available");
        void notifyUpdateAvailable(update.version);
      } else {
        updateRef.current = null;
        setStatus("up-to-date");
      }
    } catch (e) {
      // I controlli automatici falliscono in silenzio (offline, release non ancora pubblicata…).
      if (manual) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      } else {
        setStatus("idle");
      }
    } finally {
      busyRef.current = false;
    }
  }, []);

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update || busyRef.current) return;
    busyRef.current = true;
    setStatus("downloading");
    setProgress(0);
    setError(null);
    try {
      let total = 0;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          setProgress(total > 0 ? 0 : null);
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) setProgress(Math.min(downloaded / total, 1));
        } else if (event.event === "Finished") {
          setProgress(1);
        }
      });
      await relaunch(); // su Windows l'installer chiude già l'app da solo
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    } finally {
      busyRef.current = false;
    }
  }, []);

  const dismiss = useCallback(() => setDismissedVersion(version), [version]);

  // Check all'avvio, periodico e quando la finestra torna in primo piano.
  useEffect(() => {
    if (!isTauri()) return;
    const first = window.setTimeout(() => void checkNow(), FIRST_CHECK_DELAY_MS);
    const interval = window.setInterval(() => void checkNow(), CHECK_INTERVAL_MS);
    const onFocus = () => {
      if (Date.now() - lastCheckRef.current > FOCUS_THROTTLE_MS) void checkNow();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [checkNow]);

  const value = useMemo<UpdaterContextValue>(
    () => ({
      status,
      version,
      notes,
      progress,
      error,
      lastChecked,
      dismissed: version !== null && dismissedVersion === version,
      checkNow,
      install,
      dismiss,
    }),
    [status, version, notes, progress, error, lastChecked, dismissedVersion, checkNow, install, dismiss],
  );

  return <UpdaterContext.Provider value={value}>{children}</UpdaterContext.Provider>;
}

export function useUpdater() {
  const ctx = useContext(UpdaterContext);
  if (!ctx) throw new Error("useUpdater va usato dentro <UpdaterProvider>");
  return ctx;
}
