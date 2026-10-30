import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useUpdater } from "@/hooks/use-updater";

/** Barra in alto, visibile ovunque nell'app quando c'è una nuova versione. */
export function UpdateBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { status, version, progress, dismissed, install, dismiss } = useUpdater();

  if (status === "downloading") {
    return (
      <div className="flex items-center gap-3 border-b bg-muted px-4 py-2 text-sm">
        <span>Download della versione {version}…</span>
        <Progress value={(progress ?? 0) * 100} className="h-2 max-w-xs flex-1" />
      </div>
    );
  }

  if (status !== "available" || dismissed) return null;

  return (
    <div className="flex items-center gap-3 border-b bg-primary px-4 py-2 text-sm text-primary-foreground">
      <span className="flex-1">
        Nuova versione <strong>{version}</strong> disponibile.
      </span>
      <Button size="sm" variant="secondary" onClick={() => void install()}>
        Aggiorna ora
      </Button>
      <Button size="sm" variant="ghost" onClick={onOpenSettings}>
        Dettagli
      </Button>
      <Button size="sm" variant="ghost" onClick={dismiss}>
        Più tardi
      </Button>
    </div>
  );
}
