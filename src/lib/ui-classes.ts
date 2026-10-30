/** Campo di testo del design: sfondo "field", bordo sottile, accento al focus. */
export const fieldClass =
  "h-[50px] w-full rounded-xl border border-app-border bg-app-field px-4 text-[15px] text-app-text outline-none transition-colors placeholder:text-app-text-dim focus:border-app-accent-bright disabled:opacity-50";

/** Campo più compatto, usato nelle modali. */
export const modalFieldClass =
  "h-12 w-full min-w-0 rounded-xl border border-app-border bg-app-bg px-3.5 text-[15px] text-app-text outline-none transition-colors placeholder:text-app-text-dim focus:border-app-accent-bright disabled:opacity-50";

export const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-app-accent font-extrabold text-app-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export const outlineButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-app-border-strong bg-transparent font-bold text-app-text transition-colors hover:bg-app-field disabled:cursor-not-allowed disabled:opacity-50";

/** Intestazione di sezione in maiuscolo. */
export const sectionLabelClass = "text-[13px] font-extrabold tracking-[0.08em] text-app-text-dim uppercase";
