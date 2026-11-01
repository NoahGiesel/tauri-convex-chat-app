// What a run tells the developer: its timings, and the names of its failure pictures.
const RUN_WARNING_MS = 10 * 60_000;
const MAX_TITLE_CHARS = 80;

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

/** `steps` holds `{ name, ms }`. A slow run warns and does not fail. */
export function timingReport(steps) {
  const total = steps.reduce((sum, { ms }) => sum + ms, 0);
  const rows = [...steps, { name: 'total', ms: total }];
  const width = Math.max(...rows.map(({ name }) => name.length));
  const lines = rows.map(({ name, ms }) => `${name.padEnd(width)}  ${seconds(ms)}`);
  if (total > RUN_WARNING_MS) lines.push(`WARNING: the run took ${seconds(total)}, over the 10 minutes it should stay under`);
  return lines;
}

export function screenshotName(title, instance) {
  const slug = title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, MAX_TITLE_CHARS);
  return `${slug}-${instance}.png`;
}
