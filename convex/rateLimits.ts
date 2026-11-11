import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

/**
 * I limiti per persona: aprire una partita vecchia dal drawer costa una richiesta a ESPN,
 * quindi vale 10 aperture al minuto (docs/MATCH-DRAWER-SPEC.md, Older matches).
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  openPast: { kind: "fixed window", rate: 10, period: MINUTE, start: 0 },
});
