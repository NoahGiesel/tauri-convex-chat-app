import { Component, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Un errore durante il render non deve lasciare la finestra bianca (senza questo, React smonta tutto):
 * mostra un messaggio e un pulsante per ricaricare, e scrive l'errore in console per chi lo cerca.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Render error", error, info.componentStack);
  }

  render() {
    if (this.state.failed) return <ErrorFallback onReload={() => window.location.reload()} />;
    return this.props.children;
  }
}

function ErrorFallback({ onReload }: { onReload: () => void }) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      data-testid="error-fallback"
      className="flex h-screen flex-col items-center justify-center gap-3 bg-app-bg px-6 text-center"
    >
      <p className="text-lg font-extrabold text-app-text-strong">{t("error.boundaryTitle")}</p>
      <p className="max-w-sm text-sm text-app-text-muted">{t("error.boundaryBody")}</p>
      <button
        type="button"
        onClick={onReload}
        className="rounded-lg bg-app-accent px-3 py-1.5 text-sm font-semibold text-app-accent-text hover:opacity-90"
      >
        {t("error.boundaryReload")}
      </button>
    </div>
  );
}
