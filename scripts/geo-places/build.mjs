#!/usr/bin/env node
// Genera `convex/geoPlaces.ts`, l'elenco dei posti del Geo Duel (spec: docs/GEO-DUEL-SPEC.md, "City list").
//
//   node scripts/geo-places/build.mjs           scarica le fonti (se mancano nella cache) e riscrive il modulo
//   node scripts/geo-places/build.mjs --fresh   riscarica le fonti prima
//
// Serve un Node che tolga i tipi da solo (22.18+ o 24+): lo script importa le Zone da convex/geoRules.ts.
// Serve anche `unzip`. GeoNames aggiorna i file ogni giorno e non tiene le versioni vecchie: la cache
// (scripts/geo-places/.cache, fuori da git) è l'ingresso, e il modulo ne riporta data e SHA-256,
// così con la stessa cache esce lo stesso elenco.
// L'archivio dei nomi alternativi pesa circa 200 MB.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { PLACE_LANGUAGES, ZONE_BIT, distanceKm } from "../../convex/geoRules.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, ".cache");
const OUT = join(HERE, "..", "..", "convex", "geoPlaces.ts");
const BASE = "https://download.geonames.org/export/dump/";
const FILES = ["cities15000.zip", "countryInfo.txt", "alternateNamesV2.zip"];

/** Italia: ogni posto da 15.000 abitanti in su (la soglia del file). */
const ITALY_MIN_POP = 15_000;
/** Europa: dai 100.000 abitanti, più le capitali. */
const EUROPE_MIN_POP = 100_000;
/** Mondo: da 1.000.000 di abitanti, più le capitali. Sotto, troppe città che quasi nessuno conosce. */
const WORLD_MIN_POP = 1_000_000;
/** Un posto entro questa distanza da uno almeno due volte più grande è un quartiere o un sobborgo: si toglie. */
const SUBURB_KM = 6;
/** La Russia è tutta "EU" per GeoNames: la Zone Europa si ferma agli Urali. */
const EUROPE_MAX_LNG = 60;
/** Codici GeoNames dei luoghi abitati che non sono città: quartieri, storici, abbandonati, distrutti. */
const SKIP_CODES = new Set(["PPLX", "PPLH", "PPLQ", "PPLW", "PPLCH"]);

async function download(name) {
  const file = join(CACHE, name);
  if (existsSync(file) && !process.argv.includes("--fresh")) return file;
  mkdirSync(CACHE, { recursive: true });
  console.log(`scarico ${BASE}${name}`);
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** Le righe di un file dentro uno zip, una per volta, senza estrarlo. */
async function* zipLines(zip, entry) {
  const child = spawn("unzip", ["-p", zip, entry]);
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

/** Un id GeoNames per riga; `#` apre un commento. */
function readIds(name) {
  const path = join(HERE, name);
  if (!existsSync(path)) return new Set();
  return new Set(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, "").trim())
      .filter(Boolean),
  );
}

const files = Object.fromEntries(await Promise.all(FILES.map(async (f) => [f, await download(f)])));

// Continente di ogni paese (countryInfo.txt: ISO, ISO3, numerico, fips, nome, capitale, area, abitanti, continente, …).
const continent = new Map();
for (const line of readFileSync(files["countryInfo.txt"], "utf8").split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const c = line.split("\t");
  continent.set(c[0], c[8]);
}

// Città (cities15000.txt: id, nome, nome ascii, alternativi, lat, lng, classe, codice, paese, …, abitanti in colonna 14).
const exclude = readIds("exclude.txt");
const places = new Map();
for await (const line of zipLines(files["cities15000.zip"], "cities15000.txt")) {
  const c = line.split("\t");
  const [id, name, , , lat, lng, , code, country] = c;
  const pop = Number(c[14]);
  if (SKIP_CODES.has(code) || exclude.has(id)) continue;
  const capital = code === "PPLC";
  let zones = 0;
  if (country === "IT" && pop >= ITALY_MIN_POP) zones |= ZONE_BIT.italy;
  if (continent.get(country) === "EU" && Number(lng) <= EUROPE_MAX_LNG && (pop >= EUROPE_MIN_POP || capital)) zones |= ZONE_BIT.europe;
  if (pop >= WORLD_MIN_POP || capital) zones |= ZONE_BIT.world;
  if (zones === 0) continue;
  places.set(id, { id: Number(id), name, country, lat: Number(Number(lat).toFixed(4)), lng: Number(Number(lng).toFixed(4)), zones, pop });
}

// Quartieri e sobborghi che GeoNames segna come città (Mokotów a Varsavia, San Giovanni a Teduccio a Napoli).
const all = [...places.values()];
for (const p of all) {
  if (all.some((q) => q.pop >= 2 * p.pop && distanceKm(p, q) < SUBURB_KM)) places.delete(String(p.id));
}

// Nomi nelle lingue dell'app (alternateNamesV2.txt: id, geonameid, lingua, nome, preferito, corto, colloquiale, storico, da, a).
// Per ogni lingua vince il nome preferito, poi quello corto, poi il primo; mai colloquiali né storici, solo in alfabeto latino.
// Un nome con parentesi, virgole o barre ("Croydon, London") perde contro uno pulito.
/** Lettere latine (con accenti), spazi e la punteggiatura dei nomi di luogo. */
const LATIN = /^[\p{Script=Latin}\p{M}\s'’.,()/-]+$/u;
const names = new Map();
const langs = new Set(PLACE_LANGUAGES);
for await (const line of zipLines(files["alternateNamesV2.zip"], "alternateNamesV2.txt")) {
  const c = line.split("\t");
  const [, geonameId, lang, name, preferred, short, colloquial, historic] = c;
  if (!langs.has(lang) || !places.has(geonameId) || colloquial === "1" || historic === "1" || !LATIN.test(name)) continue;
  const rank = (preferred === "1" ? 0 : short === "1" ? 1 : 2) + (/[(),/]/.test(name) ? 3 : 0);
  const byLang = names.get(geonameId) ?? {};
  if (!byLang[lang] || rank < byLang[lang].rank) byLang[lang] = { name, rank };
  names.set(geonameId, byLang);
}

/** Toglie le aggiunte tra parentesi e dopo la virgola: "Nuuk (Godthåb)" → "Nuuk", "Croydon, London" → "Croydon". */
function clean(name) {
  return name && name.replace(/\s*\(.*?\)/g, "").replace(/,.*$/, "").trim();
}

const rows = [...places.values()]
  .sort((a, b) => a.id - b.id)
  .map((p) => {
    const byLang = names.get(String(p.id)) ?? {};
    const local = PLACE_LANGUAGES.map((l) => clean(byLang[l]?.name ?? (l === "en" ? p.name : null)));
    // Una lingua senza nome prende quello inglese, o quello di GeoNames.
    const en = local[PLACE_LANGUAGES.indexOf("en")] ?? p.name;
    return [p.id, p.lat, p.lng, p.country, p.zones, ...local.map((n) => n ?? en)];
  });

const count = (bit) => rows.filter((r) => r[4] & bit).length;
const stamp = (f) => `${f} del ${statSync(files[f]).mtime.toISOString().slice(0, 10)}, SHA-256 ${sha256(files[f])}`;
const header = `// GENERATO da scripts/geo-places/build.mjs: non modificare a mano.
// Posti del Geo Duel, solo per il server (il client non importa questo modulo).
// Ogni riga: [id GeoNames, lat, lng, paese, Zone (bit di ZONE_BIT), ${PLACE_LANGUAGES.map((l) => `nome ${l}`).join(", ")}].
// Italia ${count(ZONE_BIT.italy)}, Europa ${count(ZONE_BIT.europe)}, Mondo ${count(ZONE_BIT.world)} posti.
//
// Dati GeoNames, https://www.geonames.org, licenza CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
// Fonti: ${FILES.map(stamp).join("\n//        ")}
// Le note sulle fonti sono in NOTICES.md.
`;
writeFileSync(OUT, `${header}\nexport type PlaceRow = [number, number, number, string, number, ${PLACE_LANGUAGES.map(() => "string").join(", ")}];\n\nexport const PLACES: PlaceRow[] = [\n${rows.map((r) => `  ${JSON.stringify(r)},`).join("\n")}\n];\n`);
console.log(`scritto ${OUT}: ${rows.length} posti (Italia ${count(ZONE_BIT.italy)}, Europa ${count(ZONE_BIT.europe)}, Mondo ${count(ZONE_BIT.world)})`);
