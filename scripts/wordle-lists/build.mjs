#!/usr/bin/env node
// Genera `convex/wordleLists.ts`, le liste di parole del Wordle Duel (spec: docs/WORDLE-DUEL-SPEC.md, "Word lists").
//
//   node scripts/wordle-lists/build.mjs               scarica le fonti (se mancano) e riscrive il modulo
//   node scripts/wordle-lists/build.mjs --candidates  stampa le parole di wordfreq che mancano a Morph-it!,
//                                                     da rivedere per include-guesses-it.txt
//
// Le fonti sono fissate per commit e controllate con SHA-256: gli stessi ingressi danno le stesse liste.
// Le liste a mano (exclude-solutions-*.txt, include-guesses-it.txt) stanno accanto a questo file.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { passesLetterRule } from "../../convex/wordleLetters.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, ".cache");
const OUT = join(HERE, "..", "..", "convex", "wordleLists.ts");

const SOURCES = {
  esdb: {
    url: "https://raw.githubusercontent.com/en-wl/wordlist/7e99edab8e32f9f9ea2b15f249ca8d4d67237410/data/scowl-pre.txt",
    sha256: "c4f5cfaabce46bc6fe151c2aa29b121425aa045a14166ed6daaffe2cc872f0f3",
  },
  morphit: {
    url: "https://raw.githubusercontent.com/ellepannitto/morph-it-ud/82b0571d68d3ee2d9cc1845045efcb250064f7a1/data/morph-it/morph-it_048.txt",
    sha256: "705da3220c8b7dafa0731f057303da0c474efe248abe6d7ae331d1e470fd55fa",
  },
  wordfreq: {
    url: "https://raw.githubusercontent.com/rspeer/wordfreq/912caf64b657478d1dff1138efdc078947d54bb1/wordfreq/data/large_it.msgpack.gz",
    sha256: "0b5500e425a50e0f1fefb256d9125e74f586ac6b2f2a6e41bc96634bd5613cc7",
  },
};

/** Taglie ESDB: tentativi fino a 80 (tutte le forme), soluzioni fino a 35 (solo forme base). */
const EN_GUESS_SIZE = 80;
const EN_SOLUTION_SIZE = 35;
/** Soluzioni italiane: frequenza wordfreq di almeno Zipf 3.0 (circa un uso per milione di parole). */
const IT_MIN_ZIPF = 3.0;

async function source(name) {
  const { url, sha256 } = SOURCES[name];
  const file = join(CACHE, url.split("/").pop());
  if (!existsSync(file)) {
    mkdirSync(CACHE, { recursive: true });
    console.log(`scarico ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const bytes = readFileSync(file);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== sha256) throw new Error(`${file}: SHA-256 ${hash}, atteso ${sha256}. Cancella il file e riprova.`);
  return bytes;
}

/** Una parola per riga; `#` apre un commento. */
function readList(name) {
  const words = readFileSync(join(HERE, name), "utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean);
  return new Set(words);
}

// ---------------------------------------------------------------------------------------------
// Inglese: ESDB (formato descritto nel README di en-wl/wordlist, "File Format")

const SKIP_POS = new Set(["abbr", "pre", "suf", "wp", "we", "x", "s"]);
const PROPER_CLASSES = new Set(["person", "surname", "place", "name", "demonym", "trademark", "name?", "upper", "upper?", "abbr", "abbr?"]);
/** Livelli di variante ammessi nei tentativi: tutti tranne "uncommon" (-), "archaic" (@) e "invalid" (x). */
const BAD_LEVELS = new Set(["-", "@", "x"]);
/** Annotazioni di forma da scartare: "uncommon", "archaic", "nearly non-existent". */
const BAD_ANNOTATIONS = new Set(["-", "@", "!"]);

/** Divide `s` su `sep` fuori dalle parentesi tonde. */
function splitTop(s, sep) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (depth === 0 && s.startsWith(sep, i)) {
      parts.push(s.slice(start, i));
      start = i + sep.length;
      i += sep.length - 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

/** Una forma con la sua annotazione finale; null se è un segnaposto o una forma da scartare. */
function derivedWord(raw) {
  let word = raw.trim();
  const last = word.at(-1);
  if (word === "-" || word === "") return null;
  if (BAD_ANNOTATIONS.has(last)) return null;
  if ("*~†".includes(last)) word = word.slice(0, -1);
  return word;
}

const VARIANT_INFO = /^(?:[ABZCD_][.=?v~V\-@x]?(?: |$))+(?:\{\d+\})?$|^\+$/;

function parseEsdb(text) {
  const guesses = new Set();
  const solutions = new Set();
  let groupSkipped = false;

  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.trim() === "") {
      groupSkipped = false;
      continue;
    }
    if (rawLine.startsWith("#")) continue;
    const line = rawLine.replace(/\s*#.*$/, "");

    const [scowlInfo, ...restParts] = line.split(": ");
    let rest = restParts.join(": ");

    // SCOWL_INFO: gruppi "SIZE [REGION] [tag]..."; la taglia più bassa vince. Le voci della regione AU
    // restano fuori, perché porterebbero con sé un'altra nota di copyright (vedi NOTICES.md).
    let minAll = Infinity;
    let minNoRegion = Infinity;
    const tokens = scowlInfo.split(" ");
    for (let i = 0; i < tokens.length; i++) {
      if (!/^\d+$/.test(tokens[i])) continue;
      const size = Number(tokens[i]);
      const region = /^(US|GB|CA|AU)$/.test(tokens[i + 1] ?? "") ? tokens[i + 1] : null;
      if (region !== "AU") minAll = Math.min(minAll, size);
      if (!region) minNoRegion = Math.min(minNoRegion, size);
    }

    // VARIANT-INFO opzionale, poi LEMMA_INFO, poi le forme derivate.
    let variants = null;
    const [maybeVariant, ...afterVariant] = splitTop(rest, ": ");
    if (VARIANT_INFO.test(maybeVariant)) {
      variants = maybeVariant.split(" ").filter((t) => !t.startsWith("{"));
      rest = afterVariant.join(": ");
    }
    const [lemmaInfo, ...entryParts] = splitTop(rest, ": ");
    const entries = entryParts.join(": ");

    const m = lemmaInfo.match(/^(.*?)(?: <([^>]*)>)?(?: \{[^}]*\})?(?: \(([^)]*)\))?$/);
    if (!m) throw new Error(`ESDB: riga illeggibile: ${rawLine}`);
    let lemma = m[1];
    const [pos, posClass] = (m[2] ?? "").split("/");
    const usage = m[3] ?? "";

    if (lemma !== "-" && BAD_ANNOTATIONS.has(lemma[0])) {
      groupSkipped = true;
      continue;
    }
    if (groupSkipped || SKIP_POS.has(pos) || usage.startsWith("offensive")) continue;
    if (variants && variants.every((t) => t !== "+" && BAD_LEVELS.has(t.slice(1)))) continue;
    // Le grafie solo australiane (codice D) restano fuori, come la regione AU.
    if (variants && variants.every((t) => t[0] === "D")) continue;

    // Una riga vale per le soluzioni se è (anche) grafia americana, senza variante o con "include".
    const american = !variants || variants.some((t) => (t[0] === "A" || t[0] === "_") && (t.length === 1 || t[1] === "."));
    const solutionUsage = usage === "";
    const proper = PROPER_CLASSES.has(posClass ?? "");

    if (lemma !== "-") {
      lemma = derivedWord(lemma);
      if (lemma && passesLetterRule("en", lemma) && minAll <= EN_GUESS_SIZE) {
        guesses.add(lemma);
        if (minNoRegion <= EN_SOLUTION_SIZE && american && solutionUsage && !proper) solutions.add(lemma);
      }
    }

    if (minAll > EN_GUESS_SIZE || entries === "") continue;
    for (const entry of splitTop(entries, ", ")) {
      const alternatives = entry.startsWith("(") ? entry.slice(1, -1).split(" | ") : [entry];
      for (const alt of alternatives) {
        const colon = alt.indexOf(": ");
        const info = colon >= 0 ? alt.slice(0, colon) : "";
        if (info.split(" ").some((t) => BAD_LEVELS.has(t.at(-1)))) continue;
        const word = derivedWord(colon >= 0 ? alt.slice(colon + 2) : alt);
        if (word && passesLetterRule("en", word)) guesses.add(word);
      }
    }
  }
  return { guesses, solutions };
}

// ---------------------------------------------------------------------------------------------
// Italiano: Morph-it! (forma<TAB>lemma<TAB>tag, in ISO-8859-1) e wordfreq (msgpack "cB" compresso)

function parseMorphit(bytes) {
  const forms = new Set();
  for (const line of new TextDecoder("latin1").decode(bytes).split(/\r?\n/)) {
    const form = line.split("\t")[0];
    if (form && passesLetterRule("it", form)) forms.add(form);
  }
  return forms;
}

/** Decodificatore msgpack minimo: basta per le liste e le stringhe di wordfreq. */
function decodeMsgpack(buf) {
  let pos = 0;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const utf8 = new TextDecoder();
  const str = (len) => utf8.decode(buf.subarray(pos, (pos += len)));
  const arr = (len) => Array.from({ length: len }, () => read());
  const map = (len) => Object.fromEntries(Array.from({ length: len }, () => [read(), read()]));
  function read() {
    const b = buf[pos++];
    if (b <= 0x7f) return b;
    if (b >= 0x80 && b <= 0x8f) return map(b & 0x0f);
    if (b >= 0x90 && b <= 0x9f) return arr(b & 0x0f);
    if (b >= 0xa0 && b <= 0xbf) return str(b & 0x1f);
    switch (b) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xcc: return buf[pos++];
      case 0xcd: return (pos += 2), view.getUint16(pos - 2);
      case 0xce: return (pos += 4), view.getUint32(pos - 4);
      case 0xd9: return str(buf[pos++]);
      case 0xda: return str(((pos += 2), view.getUint16(pos - 2)));
      case 0xdb: return str(((pos += 4), view.getUint32(pos - 4)));
      case 0xdc: return arr(((pos += 2), view.getUint16(pos - 2)));
      case 0xdd: return arr(((pos += 4), view.getUint32(pos - 4)));
      case 0xde: return map(((pos += 2), view.getUint16(pos - 2)));
      default: throw new Error(`msgpack: tipo 0x${b.toString(16)} non gestito`);
    }
  }
  return read();
}

/** Parole di wordfreq con Zipf ≥ minZipf. Il secchio i (dopo l'intestazione) vale -i centibel, cioè Zipf 9 - i/100. */
function frequentWords(bytes, minZipf) {
  const [header, ...buckets] = decodeMsgpack(gunzipSync(bytes));
  if (header?.format !== "cB") throw new Error("wordfreq: formato inatteso");
  const out = new Set();
  const maxBucket = Math.round((9 - minZipf) * 100);
  buckets.slice(0, maxBucket + 1).forEach((bucket) => bucket.forEach((word) => out.add(word)));
  return out;
}

// ---------------------------------------------------------------------------------------------

function checkHandList(name, lang, words) {
  const bad = [...words].filter((w) => !passesLetterRule(lang, w));
  if (bad.length) throw new Error(`${name}: parole che non rispettano la regola delle lettere: ${bad.join(", ")}`);
}

function minus(set, remove) {
  return new Set([...set].filter((w) => !remove.has(w)));
}

/** Fallisce se una soluzione non è anche un tentativo. */
export function assertSolutionsAreGuesses(lang, solutions, guesses) {
  const missing = [...solutions].filter((w) => !guesses.has(w));
  if (missing.length) throw new Error(`${lang}: soluzioni che non sono tentativi: ${missing.join(", ")}`);
}

const pack = (set) => [...set].sort().join("");

const HEADER = `// GENERATO da scripts/wordle-lists/build.mjs: non modificare a mano.
// Liste di parole del Wordle Duel, solo per il server (il client non importa questo modulo).
// Ogni lista è una stringa di parole da cinque lettere attaccate, in ordine alfabetico.
//
// Inglese (EN_GUESSES, EN_SOLUTIONS): derivate da ESDB (SCOWLv2) rel-2026.02.25, https://github.com/en-wl/wordlist
//   Copyright 2000-2026 by Kevin Atkinson
//
//   Permission to use, copy, modify, distribute, and sell any part of SCOWLv2, or
//   word lists created from it, is hereby granted without fee, provided that the
//   above copyright notice appears in all copies and that both the above
//   copyright notice and this notice appear in supporting documentation.  Kevin
//   Atkinson makes no representations about the suitability of this database for
//   any purpose.  It is provided "as is" without express or implied warranty.
//
//   Le note sulle fonti sono in NOTICES.md.
//
// Italiano (IT_GUESSES, IT_SOLUTIONS): CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/
//   Derivate da Morph-it! 0.4.8 di Marco Baroni ed Eros Zanchetta (CC BY-SA 2.0 / LGPL) e dalle frequenze
//   di wordfreq (Robyn Speer, CC BY-SA 4.0; fonti: Google Books Ngrams, Wikipedia, OpenSubtitles, ParaCrawl,
//   Leeds Internet Corpus), più una lista curata a mano. Solo queste liste sono CC BY-SA, non il resto dell'app.
`;

async function main() {
  const [esdbBytes, morphitBytes, wordfreqBytes] = await Promise.all([source("esdb"), source("morphit"), source("wordfreq")]);

  const en = parseEsdb(esdbBytes.toString("utf8"));
  const morphit = parseMorphit(morphitBytes);
  const frequent = frequentWords(wordfreqBytes, IT_MIN_ZIPF);

  if (process.argv.includes("--candidates")) {
    const candidates = [...frequent].filter((w) => passesLetterRule("it", w) && !morphit.has(w)).sort();
    console.log(candidates.join("\n"));
    console.error(`${candidates.length} candidati`);
    return;
  }

  const excludeEn = readList("exclude-solutions-en.txt");
  const excludeIt = readList("exclude-solutions-it.txt");
  const includeIt = readList("include-guesses-it.txt");
  checkHandList("exclude-solutions-en.txt", "en", excludeEn);
  checkHandList("exclude-solutions-it.txt", "it", excludeIt);
  checkHandList("include-guesses-it.txt", "it", includeIt);

  const enGuesses = en.guesses;
  const enSolutions = minus(en.solutions, excludeEn);
  const itGuesses = new Set([...morphit, ...includeIt]);
  const itSolutions = minus(new Set([...morphit].filter((w) => frequent.has(w))), excludeIt);

  assertSolutionsAreGuesses("en", enSolutions, enGuesses);
  assertSolutionsAreGuesses("it", itSolutions, itGuesses);

  const body = [
    HEADER,
    `export const EN_GUESSES = ${JSON.stringify(pack(enGuesses))};`,
    `export const EN_SOLUTIONS = ${JSON.stringify(pack(enSolutions))};`,
    `export const IT_GUESSES = ${JSON.stringify(pack(itGuesses))};`,
    `export const IT_SOLUTIONS = ${JSON.stringify(pack(itSolutions))};`,
    "",
  ].join("\n");
  writeFileSync(OUT, body);
  console.log(
    `EN: ${enGuesses.size} tentativi, ${enSolutions.size} soluzioni. IT: ${itGuesses.size} tentativi, ${itSolutions.size} soluzioni.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
