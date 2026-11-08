import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/** L'indice delle squadre di `/calcio`: le liste cambiano con promozioni e coppe. Lunedì alle 04:00 UTC. */
crons.cron("rebuild football team index", "0 4 * * 1", internal.footballTeams.rebuildIndex, {});

export default crons;
