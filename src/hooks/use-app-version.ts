import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

/** Versione installata dell'app ("dev" fuori da Tauri). */
export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("dev"));
  }, []);
  return version;
}
