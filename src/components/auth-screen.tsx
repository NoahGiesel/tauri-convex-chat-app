import { useState, type FormEvent } from "react";
import { Eye, EyeOff, MessageSquare } from "lucide-react";
import { LanguageSelect } from "@/components/language-select";
import { useI18n } from "@/i18n/i18n-provider";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { fieldClass, primaryButtonClass } from "@/lib/ui-classes";

/** Login e registrazione: pannello illustrato a sinistra, modulo a destra (come nel design). */
export function AuthScreen() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === "signUp";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = isSignUp
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      // I messaggi di Better Auth sono in inglese: mostriamo il testo tradotto.
      if (result.error) setError(t("error.generic"));
      // In caso di successo la sessione cambia e <App /> mostra la chat da solo.
    } catch {
      setError(t("auth.errorNetwork"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-screen flex-wrap gap-4 overflow-y-auto bg-app-bg p-4 text-app-text">
      <div
        className="relative min-h-[480px] flex-[1_1_380px] overflow-hidden rounded-[22px]"
        style={{ background: "linear-gradient(165deg, var(--app-art-0) 0%, var(--app-art-1) 48%, var(--app-art-2) 100%)" }}
      >
        <svg aria-hidden viewBox="0 0 400 600" preserveAspectRatio="none" className="absolute bottom-0 left-0 h-[78%] w-full">
          <path d="M0 330 C70 300 130 210 215 150 C300 195 340 300 400 340 L400 600 L0 600 Z" fill="var(--app-art-3)" opacity="0.55" />
          <path d="M0 420 C90 400 150 310 250 270 C320 330 360 400 400 430 L400 600 L0 600 Z" fill="var(--app-art-4)" opacity="0.8" />
          <path d="M0 520 C100 500 190 470 270 480 C330 490 370 520 400 530 L400 600 L0 600 Z" fill="var(--app-art-5)" />
        </svg>
        <div className="absolute top-[26px] left-7 flex items-center gap-2.5 text-white">
          <MessageSquare className="size-7" strokeWidth={2} />
          <span className="text-2xl font-extrabold tracking-tight">chat</span>
        </div>
        <div className="absolute right-8 bottom-16 left-8 text-[clamp(26px,3vw,34px)] leading-[1.15] font-bold tracking-tight text-white">
          {t("auth.taglineLine1")}
          <br />
          {t("auth.taglineLine2")}
        </div>
        <div aria-hidden className="absolute right-0 bottom-[30px] left-0 flex justify-center gap-2">
          <div className="h-1 w-10 rounded-sm bg-white/35" />
          <div className="h-1 w-10 rounded-sm bg-white/35" />
          <div className="h-1 w-10 rounded-sm bg-app-accent-fg" />
        </div>
      </div>

      <div className="relative flex flex-[1.3_1_440px] flex-col justify-center px-[clamp(16px,6vw,72px)] py-8">
        <div className="absolute top-2 right-2">
          <LanguageSelect />
        </div>

        <form onSubmit={onSubmit} className="flex w-full max-w-[480px] flex-col gap-5">
          <div>
            <h1 className="text-[clamp(30px,4vw,44px)] leading-[1.1] font-bold tracking-tight text-app-text-strong">
              {isSignUp ? t("auth.createTitle") : t("auth.welcomeBack")}
            </h1>
            <p className="mt-3.5 text-[15px] text-app-text-muted">
              {isSignUp ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
              <button
                type="button"
                className="text-app-accent-text underline-offset-4 hover:underline"
                onClick={() => {
                  setMode(isSignUp ? "signIn" : "signUp");
                  setError(null);
                }}
              >
                {isSignUp ? t("auth.signIn") : t("auth.registerLink")}
              </button>
            </p>
          </div>

          <div className="flex flex-col gap-3.5">
            {isSignUp && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="name" className="text-[13px] font-semibold text-app-text-soft">
                  {t("auth.name")}
                </label>
                <input
                  id="name"
                  className={fieldClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder={t("auth.namePlaceholder")}
                  required
                  disabled={busy}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-[13px] font-semibold text-app-text-soft">
                {t("auth.email")}
              </label>
              <input
                id="email"
                className={fieldClass}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder")}
                required
                disabled={busy}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-[13px] font-semibold text-app-text-soft">
                {t("auth.password")}
              </label>
              <div className="relative">
                <input
                  id="password"
                  className={cn(fieldClass, "pr-[52px]")}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  placeholder={isSignUp ? t("auth.passwordPlaceholder") : undefined}
                  minLength={8}
                  required
                  disabled={busy}
                />
                <button
                  type="button"
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-[5px] right-1.5 flex size-10 items-center justify-center rounded-[10px] text-app-text-muted hover:bg-app-raised"
                >
                  {showPassword ? <EyeOff className="size-5" strokeWidth={1.8} /> : <Eye className="size-5" strokeWidth={1.8} />}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className={cn(primaryButtonClass, "h-[52px] text-base")}>
            {busy ? t("auth.busy") : isSignUp ? t("auth.signUp") : t("auth.signIn")}
          </button>
        </form>
      </div>
    </div>
  );
}
