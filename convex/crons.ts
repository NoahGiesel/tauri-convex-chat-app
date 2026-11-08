import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/** L'indice delle squadre di `/calcio`: le liste cambiano con promozioni e coppe. Lunedì alle 04:00 UTC. */
crons.cron("rebuild football team index", "0 4 * * 1", internal.footballTeams.rebuildIndex, {});

/** La prossima partita di ogni squadra pinnata: così un calcio d'inizio spostato arriva anche senza nuovi pin. */
crons.interval("refresh next football matches", { hours: 6 }, internal.footballMatches.refreshPinnedTeams, {});

/** Il risultato in diretta: a ESPN si chiedono solo le partite in corso o a meno di 60 minuti dal calcio d'inizio. */
crons.interval("poll live football matches", { seconds: 30 }, internal.footballMatches.tick, {});

/** Le partite finite da più di 7 giorni, tranne l'ultima di ogni squadra. Ogni giorno alle 05:00 UTC. */
crons.cron("clean up football matches", "0 5 * * *", internal.footballMatches.cleanup, {});

export default crons;
