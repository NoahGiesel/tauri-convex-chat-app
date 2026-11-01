/**
 * Mostra la barra di scorrimento di un elemento solo mentre ci si scorre dentro e la nasconde (con dissolvenza)
 * dopo un secondo di quiete. Un solo ascolto in fase di cattura copre tutti gli elementi scorrevoli dell'app.
 */
const HIDE_AFTER_MS = 1000;
const timers = new WeakMap<Element, number>();

export function installAutoHideScrollbars() {
  document.addEventListener(
    "scroll",
    (e) => {
      const el = e.target instanceof Element ? e.target : document.documentElement;
      el.setAttribute("data-scrolling", "");
      window.clearTimeout(timers.get(el));
      timers.set(
        el,
        window.setTimeout(() => el.removeAttribute("data-scrolling"), HIDE_AFTER_MS),
      );
    },
    { capture: true, passive: true },
  );
}
