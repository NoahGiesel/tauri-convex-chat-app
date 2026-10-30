import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useUpdater } from "@/hooks/use-updater";

export function SettingsUpdates() {
  const { status, version, notes, progress, error, lastChecked, checkNow, install } = useUpdater();
  const [current, setCurrent] = useState<string>("—");

  useEffect(() => {
    getVersion().then(setCurrent).catch(() => setCurrent("dev"));
  }, []);

  const busy = status === "checking" || status === "downloading";

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Aggiornamenti</CardTitle>
        <CardDescription>
          Versione installata: <strong>{current}</strong>
          {lastChecked && <> · ultimo controllo alle {lastChecked.toLocaleTimeString("it-IT")}</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "up-to-date" && <p className="text-sm">Sei aggiornato all'ultima versione.</p>}
        {status === "error" && <p className="text-sm text-destructive">Errore: {error}</p>}

        {(status === "available" || status === "downloading") && (
          <div className="space-y-2">
            <p className="text-sm">
              Disponibile la versione <strong>{version}</strong>.
            </p>
            {notes && (
              <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                {notes}
              </pre>
            )}
            {status === "downloading" && <Progress value={(progress ?? 0) * 100} className="h-2" />}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void checkNow(true)}>
            {status === "checking" ? "Controllo…" : "Controlla aggiornamenti"}
          </Button>
          {status === "available" && <Button onClick={() => void install()}>Scarica e installa</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
