import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { getPingPlace, onPingPlaceChange, type PingPlace } from "@/lib/ping-pref";

const INTERVAL_MS = 10_000;
const SAMPLES = 3;
const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type PingState = { ms: number } | { offline: true } | null;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** Latenza verso internet (non verso Convex), misurata ogni 10 secondi solo con la finestra visibile. */
export function usePing(enabled: boolean): PingState {
  const [state, setState] = useState<PingState>(null);

  useEffect(() => {
    if (!enabled || !isTauri()) {
      setState(null);
      return;
    }
    let alive = true;
    let samples: number[] = [];
    const measure = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const ms = await invoke<number | null>("ping");
        if (!alive) return;
        if (ms == null) {
          samples = [];
          setState({ offline: true });
        } else {
          samples = [...samples, ms].slice(-SAMPLES);
          setState({ ms: median(samples) });
        }
      } catch {
        if (alive) setState(null);
      }
    };
    void measure();
    const id = window.setInterval(measure, INTERVAL_MS);
    document.addEventListener("visibilitychange", measure);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", measure);
    };
  }, [enabled]);

  return state;
}

/** Dove l'utente ha scelto di mostrare il ping (si aggiorna quando cambia nelle Preferenze). */
export function usePingPlace(): PingPlace {
  const [place, setPlace] = useState(getPingPlace);
  useEffect(() => onPingPlaceChange(() => setPlace(getPingPlace())), []);
  return place;
}
