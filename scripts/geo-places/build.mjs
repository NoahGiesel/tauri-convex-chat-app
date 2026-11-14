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
/** Pagine Wikipedia di ogni posto (lingua "link" di GeoNames), per trovare la foto quando Wikidata non ha l'id GeoNames. */
const wikiLinks = new Map();
const langs = new Set(PLACE_LANGUAGES);
for await (const line of zipLines(files["alternateNamesV2.zip"], "alternateNamesV2.txt")) {
  const c = line.split("\t");
  const [, geonameId, lang, name, preferred, short, colloquial, historic] = c;
  if (lang === "link" && places.has(geonameId) && /^https?:\/\/(it|en)\.wikipedia\.org\/wiki\//.test(name)) {
    wikiLinks.set(geonameId, [...(wikiLinks.get(geonameId) ?? []), name]);
    continue;
  }
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

// ---------------------------------------------------------------------------------------------
// Foto: l'immagine principale (P18) dell'elemento Wikidata con lo stesso id GeoNames (P1566), con autore e licenza
// da Wikimedia Commons. Le risposte restano nella cache: con --fresh si richiedono di nuovo.

const PHOTOS_OUT = join(HERE, "..", "..", "convex", "geoPhotos.ts");
const USER_AGENT = "tauri-convex-chat-geo-build/1.0 (https://github.com/NoahGiesel/tauri-convex-chat-app)";
/** File che quasi sempre non sono una foto della città: mappe, stemmi, bandiere, disegni. */
const NOT_A_PHOTO = /\b(map|mapa|mappa|karte|carte|locator|location|lage|stemma|coat|wappen|escudo|blason|flag|bandiera|flagge|bandera|logo|seal|emblem|plan|diagram)\b|\.(svg|gif|tiff?)$/i;
const PHOTO_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIN_PHOTO_WIDTH = 800;

async function cachedJson(name, fetcher) {
  const file = join(CACHE, name);
  if (existsSync(file) && !process.argv.includes("--fresh")) return JSON.parse(readFileSync(file, "utf8"));
  const data = await fetcher();
  writeFileSync(file, JSON.stringify(data));
  return data;
}

async function getJson(url, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { ...init, headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...init.headers } });
    if (res.ok) return res.json();
    if (attempt >= 4 || (res.status !== 429 && res.status < 500)) throw new Error(`${url.slice(0, 80)}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
const ids = rows.map((r) => String(r[0]));

// id GeoNames → nome del file su Commons. Se un posto ha più immagini vince la prima in ordine alfabetico.
const p18 = await cachedJson("wikidata-p18.json", async () => {
  const out = {};
  for (const batch of chunks(ids, 300)) {
    const query = `SELECT ?gn ?img WHERE { VALUES ?gn { ${batch.map((id) => `"${id}"`).join(" ")} } ?item wdt:P1566 ?gn; wdt:P18 ?img. }`;
    const data = await getJson("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
      body: new URLSearchParams({ query }),
    });
    for (const b of data.results.bindings) {
      const file = decodeURIComponent(b.img.value.split("/Special:FilePath/")[1]).replaceAll("_", " ");
      if (!out[b.gn.value] || file < out[b.gn.value]) out[b.gn.value] = file;
    }
    console.log(`Wikidata: ${Object.keys(out).length} immagini`);
  }
  return out;
});

// Chi non ha la foto per id GeoNames la cerca dalla sua pagina Wikipedia (prima italiana, poi inglese):
// pagina → elemento Wikidata → P18.
const viaWikipedia = await cachedJson("wikipedia-p18.json", async () => {
  const out = {};
  const pages = { it: new Map(), en: new Map() };
  for (const id of ids) {
    if (p18[id]) continue;
    const links = wikiLinks.get(id) ?? [];
    const link = links.find((l) => l.includes("//it.")) ?? links.find((l) => l.includes("//en."));
    if (!link) continue;
    const lang = link.includes("//it.") ? "it" : "en";
    pages[lang].set(decodeURIComponent(link.split("/wiki/")[1]).replaceAll("_", " "), id);
  }
  const items = new Map();
  for (const lang of ["it", "en"]) {
    for (const batch of chunks([...pages[lang].keys()], 50)) {
      const url = `https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "pageprops", ppprop: "wikibase_item", redirects: "1", titles: batch.join("|") })}`;
      const data = await getJson(url);
      const back = new Map(batch.map((t) => [t, t]));
      for (const n of [...(data.query.normalized ?? []), ...(data.query.redirects ?? [])]) back.set(n.to, back.get(n.from) ?? n.from);
      for (const page of data.query.pages) {
        const item = page.pageprops?.wikibase_item;
        const id = pages[lang].get(back.get(page.title) ?? page.title);
        if (item && id) items.set(item, id);
      }
    }
  }
  for (const batch of chunks([...items.keys()], 300)) {
    const query = `SELECT ?item ?img WHERE { VALUES ?item { ${batch.map((q) => `wd:${q}`).join(" ")} } ?item wdt:P18 ?img. }`;
    const data = await getJson("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
      body: new URLSearchParams({ query }),
    });
    for (const b of data.results.bindings) {
      const id = items.get(b.item.value.split("/").pop());
      const file = decodeURIComponent(b.img.value.split("/Special:FilePath/")[1]).replaceAll("_", " ");
      if (id && (!out[id] || file < out[id])) out[id] = file;
    }
  }
  console.log(`Wikipedia: ${Object.keys(out).length} immagini in più`);
  return out;
});
Object.assign(p18, viaWikipedia);

// Nome del file → tipo, larghezza, autore e licenza.
const files_ = [...new Set(Object.values(p18))];
const meta = await cachedJson("commons-meta.json", async () => {
  const out = {};
  for (const batch of chunks(files_, 50)) {
    const url = `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      prop: "imageinfo",
      iiprop: "extmetadata|mime|size",
      iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl",
      titles: batch.map((f) => `File:${f}`).join("|"),
    })}`;
    const data = await getJson(url);
    const normalized = new Map((data.query.normalized ?? []).map((n) => [n.to, n.from]));
    for (const page of data.query.pages) {
      const info = page.imageinfo?.[0];
      if (!info) continue;
      const title = (normalized.get(page.title) ?? page.title).replace(/^File:/, "");
      const m = info.extmetadata ?? {};
      out[title] = { mime: info.mime, width: info.width, artist: m.Artist?.value ?? "", license: m.LicenseShortName?.value ?? "", licenseUrl: m.LicenseUrl?.value ?? "" };
    }
    console.log(`Commons: ${Object.keys(out).length} file`);
  }
  return out;
});

/** L'autore come testo: Commons lo dà in HTML. */
const plain = (html) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim().slice(0, 80);

const photos = rows.flatMap((r) => {
  const file = p18[String(r[0])];
  const m = file && meta[file];
  if (!m || NOT_A_PHOTO.test(file) || !PHOTO_MIMES.has(m.mime) || m.width < MIN_PHOTO_WIDTH || !m.license) return [];
  return [[r[0], file, plain(m.artist) || "Wikimedia Commons", m.license, m.licenseUrl]];
});
const photoCount = (bit) => photos.filter(([id]) => rows.find((r) => r[0] === id)[4] & bit).length;
writeFileSync(
  PHOTOS_OUT,
  `// GENERATO da scripts/geo-places/build.mjs: non modificare a mano.
// Foto dei posti del Geo Duel, solo per il server: il nome del file direbbe spesso dov'è la foto.
// Ogni riga: [id GeoNames, file su Wikimedia Commons, autore, licenza, indirizzo della licenza].
// Italia ${photoCount(ZONE_BIT.italy)}, Europa ${photoCount(ZONE_BIT.europe)}, Mondo ${photoCount(ZONE_BIT.world)} posti con foto.
//
// Scelte dall'immagine principale (P18) di Wikidata, https://www.wikidata.org (CC0); le foto sono su
// Wikimedia Commons, ognuna con la sua licenza, e il gioco ne mostra autore e licenza.

export type PhotoRow = [number, string, string, string, string];

export const PHOTOS: PhotoRow[] = [
${photos.map((p) => `  ${JSON.stringify(p)},`).join("\n")}
];
`,
);
console.log(`scritto ${PHOTOS_OUT}: ${photos.length} foto (Italia ${photoCount(ZONE_BIT.italy)}, Europa ${photoCount(ZONE_BIT.europe)}, Mondo ${photoCount(ZONE_BIT.world)})`);
