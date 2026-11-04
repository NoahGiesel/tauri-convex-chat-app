# Which Italian and English word lists can the Wordle Duel use?

Research for issue #74 on the map #73 "Add an async 1v1 Wordle Duel". Throwaway branch, never
merged. Researched on 2026-11-04.

## Answer

**English: ESDB (formerly SCOWL).** Licence is MIT-like and allows redistribution as long as the
copyright notice is kept. One source gives both lists, because every word has a "size" that grades
how common it is:

- **Allowed guesses:** size 80 or below, all inflected forms. About 8,900 words.
- **Solutions:** size 35 or below, base forms only. About 2,300 words, or 1,760 after an optional
  frequency cut.

**Italian: Morph-it! 0.4.8.** It is dual-licensed CC BY-SA 2.0 or LGPL. Redistribution is allowed
with credit, and the derived lists must stay CC BY-SA. Every form carries its lemma and a
part-of-speech tag, so plurals and verb forms can be filtered by rule. Morph-it! has no frequency
data, so pair it with **wordfreq** (CC BY-SA 4.0) to choose solutions. Counts after the letter rule:

- **Allowed guesses:** 4,711 words.
- **Solutions:** 1,030 to 2,152 words, depending on the plural and verb-form choice. These counts use
  a frequency cut of Zipf 3.0 or more.

Morph-it! misses some everyday words (*capra*, *aceto*, *ovest*, *audio*), so the guess list needs a
small hand-reviewed supplement.

**Storage: bundle the lists as a TypeScript module under `convex/`.** All four lists come to about
86 KB after bundling. The limit is 230 MB per deployment, and there is no separate per-module
limit. Checking a guess and picking a word then cost no database reads. Both are a few nanoseconds
in memory. The lists also reach dev, prod, the local E2E backend and `convex-test` with every push,
with no seeding. A table works too (one indexed read per guess), but it needs seeding in every
deployment and gains nothing here.

## How to read this

Every claim carries one of three labels:

- **[ran]**: executed on this machine and observed.
- **[read]**: read in a licence file, source or docs, not executed.
- **[inferred]**: follows from what was run or read, but was not itself observed.

Licence statements are a reading of the licence texts, not legal advice.

| Source used | Version |
|---|---|
| `convex` (`pnpm-lock.yaml`) | 1.49.0 (bundles with `esbuild` 0.27.0) |
| ESDB / SCOWL ([en-wl/wordlist](https://github.com/en-wl/wordlist)) | tag `rel-2026.02.25` (`7e99eda`) |
| Morph-it! | 0.4.8, from the mirror [ellepannitto/morph-it-ud](https://github.com/ellepannitto/morph-it-ud) at `82b0571` |
| wordfreq ([rspeer/wordfreq](https://github.com/rspeer/wordfreq)) | `master` at `912caf6`, `large_it` and `large_en` |
| paroleitaliane ([napolux/paroleitaliane](https://github.com/napolux/paroleitaliane)) | `HEAD` at `2951524` |
| Convex backend source ([get-convex/convex-backend](https://github.com/get-convex/convex-backend)) | `main` at `94d904f` (2026-11-04) |
| Machine | Windows 11, Node 24.1.0, Python 3.11 |

The lists were downloaded into a scratch directory outside the repo and filtered by my own scripts.
No code from the downloads was executed. Not one word list is committed on this branch.

"Five-letter word" below always means: exactly five letters, all lowercase. That drops proper nouns,
abbreviations, possessives and hyphenated words. For Italian the letters must also come from
`a b c d e f g h i l m n o p q r s t u v z`. That drops accented letters, apostrophes and
j, k, w, x, y.

## English

### ESDB / SCOWL (recommended)

**[read]** Licence ([`Copyright`](https://github.com/en-wl/wordlist/blob/rel-2026.02.25/Copyright)):
"Permission to use, copy, modify, distribute, and sell any part of [ESDB] ... or word lists created
from it, is hereby granted without fee, provided that the above copyright notice appears in all
copies". Its sources are mostly public domain (12dicts, ENABLE2K).

Two extra clauses apply only outside the range we need. Lists **larger than size 80** carry the
UKACD notice. Australian spellings carry the Titze notice. A list of size 80 or below with US and
British spellings needs only the main notice.

**[read]** Sizes ([README](https://github.com/en-wl/wordlist/blob/rel-2026.02.25/README.md), "SIZE"):

| Size | Meaning |
|---|---|
| 35 | small |
| 50 | medium |
| 60 | medium-large; default spell checker |
| 70 | large |
| 80 | "a valid word in current usage", including "the strange and unusual words people like to use in word games such as Scrabble" |
| 85 | valid, but may be dated |

Each entry also has a part of speech and its inflected forms (plural, past tense, and so on). Usage
notes mark offensive and vulgar words, but the README warns this "only covers the worst offenders".

**[ran]** Five-letter words, parsed from `data/scowl-pre.txt` by my own parser. I left out entries
marked offensive or vulgar, and forms marked uncommon, archaic or "nearly non-existent". US and
British spellings are both kept.

| Max size | All forms | Base forms only (no plurals, no -ed/-ing/-s forms) |
|---:|---:|---:|
| 35 | 3,624 | **2,326** |
| 50 | 4,728 | 3,122 |
| 60 | 5,397 | 3,636 |
| 70 | 7,156 | 4,903 |
| 80 | **8,882** | 6,192 |
| 85 | 11,501 | 8,136 |

These counts are approximate. `scowl-pre.txt` is the pre-processed input. The official
`./scowl word-list` tool also merges `data/extra`, `data/fixes` and others, and I did not run it.

**[ran]** Checks:

- *crane, slate, hello, irate, audio, pizza, nymph* are all at size 35. *fjord* and *adieu* are at 50.
- Words found only at size 80 look like Scrabble words: *kugel, cuvee, aboil, avgas, wingy*. That is
  right for guesses and wrong for solutions.
- The size-35 base forms still include a few words you would not want as solutions, such as
  *fagot*, *lemme* and *bundy*. A hand review is needed.
- Coverage: wordfreq lists 1,121 English five-letter words at Zipf 4.0 or more. 80 of them are not
  in the size-80 list. All 80 are names or apostrophe-less contractions (*april, david, paris,
  thats, didnt*). No ordinary word was missing.

**Solutions, told apart from rare words:** the size is the frequency signal. Size 35 base forms give
2,326 words, close to the 2,309 of the original Wordle. An optional second cut keeps only words
with wordfreq Zipf 3.0 or more, which gives **1,760 [ran]**. That cut adds a CC BY-SA attribution
(see below), so English can also stay purely ESDB.

### Other English sources (not recommended)

- **[read]** [tabatkins/wordle-list](https://github.com/tabatkins/wordle-list) is labelled MIT, but its
  README says the words are "taken straight from the game's source code", meaning the NYT's lists.
  A repo licence cannot relicense them. Avoid.
- **[read]** [dwyl/english-words](https://github.com/dwyl/english-words) is Unlicense, 479k entries,
  pulled from an infochimps spreadsheet of unclear origin. It has no frequency data and is very
  noisy.
- **[inferred]** ENABLE2K is public domain, but it is already inside ESDB (size 80) and has no
  frequency grading.

## Italian

### Morph-it! 0.4.8 (recommended base)

**[read]** Licence (`readme-morph-it.txt` in the mirror): "dual-licensed ... under the terms of the
Creative Commons Attribution ShareAlike 2.0 License and the GNU Lesser General Public License". You
must "give the original authors credit" (Marco Baroni, Eros Zanchetta), and derived works may be
distributed "only under a license identical to this one".

One quirk: the section headed LGPL actually quotes the GPL v2+ text. The CC BY-SA 2.0 option is the
clean one.

**[read]** The [CC BY-SA 2.0 legal code](https://creativecommons.org/licenses/by-sa/2.0/legalcode)
§4(b) also allows "a later version of this License with the same License Elements". So the derived
list can ship as CC BY-SA 4.0, the same licence as wordfreq.

**[inferred]** ShareAlike binds the derived word list, not the app code. A list kept in its own file,
with its own notice, is a separate part of the repo.

**[read]** Format: one line per form, as `form<TAB>lemma<TAB>tag`, for example
`andarono andare VER:ind+past+3+p`. There are 504,906 entries and 34,968 lemmas. The data come from
the *la Repubblica* newspaper corpus. The README warns of "many gaps in basic, every-day
vocabulary". The file is ISO-8859-1. Some accents are written as an apostrophe (`Citta'`), so the
letter filter must drop apostrophes as well as accented letters.

**[ran]** Filtering the 505,074 lines:

| Step | Unique forms |
|---|---:|
| Lowercase, five characters | 5,442 |
| minus accents, apostrophes and other non-a–z | −666 |
| minus j, k, w, x, y | −65 |
| **Allowed guesses (all forms)** | **4,711** |

**[ran]** Forms by tag. A form can appear in more than one row (*amare* is a verb and an adjective
plural):

| Tag group | Forms |
|---|---:|
| Noun, singular | 1,063 |
| Noun, plural | 1,047 |
| Adjective, base form | 315 |
| Adjective, other gender/number or altered | 756 |
| Verb infinitive | 16 (*amare, usare, unire, stare, avere* ...) |
| Conjugated verb | 2,512 |
| Past participle | 229 |

Few five-letter infinitives exist, so "no verb forms" means almost no verbs at all.

**[ran]** Three rule sets for solutions. Each removes a form only if *every* reading of it falls in
the excluded group:

| Rule | Forms | ∩ wordfreq Zipf ≥ 3.0 | ∩ Zipf ≥ 3.5 |
|---|---:|---:|---:|
| A. All forms | 4,711 | 2,152 | 1,524 |
| B. No conjugated verbs or participles | 2,696 | **1,757** | 1,262 |
| C. B, and no plurals or inflected adjectives | 1,320 | **1,030** | 773 |

Samples from rule B: *piedi, umido, muffa, festa, ferro, cesta, notti, sante*. Samples from rule C:
*volpe, sarto, sauna, mazzo, fiaba, cifra, marzo*.

Both rules keep a few function words, such as *nella* and *nelle*. They also keep some verb forms
that have a second reading, such as *passa* and *presi*. A hand review is needed.

**[ran]** 10 of the 1,757 rule-B words are on paroleitaliane's
[`lista_badwords.txt`](https://github.com/napolux/paroleitaliane/blob/master/paroleitaliane/lista_badwords.txt).
That list (454 entries) can serve as a review aid.

**[ran]** Gaps. wordfreq has 3,038 Italian five-letter words at Zipf 3.0 or more. 886 of them are
not in Morph-it!. Most are names or English (*maria, paolo, trump, apple, green*). Real words are
mixed in, for example:

| Word | Zipf |
|---|---:|
| *ovest* | 4.48 |
| *audio* | 4.46 |
| *capra* | 3.96 |
| *aceto* | 3.65 |
| *aglio* | 3.90 |
| *meteo* | 4.08 |
| *perle* | 4.04 |
| *droni* | 3.81 |
| *etero* | 3.99 |

Unless those are added, a player typing *capra* would be rejected.

### wordfreq (frequency for solutions)

**[read]** [README, "License"](https://github.com/rspeer/wordfreq#license): the code is Apache 2.0 and
the data "may be redistributed under a Creative Commons Attribution-ShareAlike 4.0 license". It
asks for credit to its sources: Google Books Ngrams, Wikipedia, OpenSubtitles, ParaCrawl and the
Leeds corpus.

**[read]** The project is sunset ([SUNSET.md](https://github.com/rspeer/wordfreq/blob/master/SUNSET.md)).
The data are frozen, which is fine for a fixed list.

**[ran]** `large_it` holds 322,796 words and `large_en` holds 321,180. Zipf 3.0 means about one
use per million words.

**[read]** An alternative is [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)
(OpenSubtitles only, data "CC-by-sa-4.0"), under the same terms.

### paroleitaliane (not recommended as the base)

**[read]** It is labelled MIT, but its
[README](https://github.com/napolux/paroleitaliane#readme) says some lists are "di provenienza
ignota, recuperate da un vecchio hard disk". The 660k list credits
[pazqo/scalaWords](https://github.com/pazqo/scalaWords), which has no licence. So the MIT label
cannot be relied on for the words themselves.

**[ran]** The lists also have no tags and no frequency data, and they have gaps of their own. The
660k list lacks *aiuto*, *bravo* and *saldo*.

**[ran]** Five-letter counts after the letter rule:

| List | Words |
|---|---:|
| 60k | 2,343 |
| 280k | 5,791 |
| 660k | 7,173 |
| 660k ∪ Morph-it! | 8,364 (overlap with Morph-it!: 3,520) |

**[read]** The Italian Wordle clone [pietroppeter/wordle-it](https://github.com/pietroppeter/wordle-it)
took its words from paroleitaliane and sigmasaur/AnagramSolver. Neither that clone nor
AnagramSolver has a licence.

### Others (not recommended)

- **[read]** Hunspell `it_IT` ([LibreOffice/dictionaries](https://github.com/LibreOffice/dictionaries/tree/master/it_IT))
  is "GNU GPL 3". The repo is public with no licence of its own, so a GPL list is the riskiest
  choice. Its affix rules would also need expanding to get the forms.
- **[ran]** Wiktionary through [kaikki.org](https://kaikki.org/dictionary/Italian/) is CC BY-SA and
  GFDL, and tags every form. The Italian extract is 743 MB of JSONL. Not downloaded, but it is a
  possible source for filling Morph-it!'s gaps.

## How the lists fit Convex

### Shipping them as a module (recommended)

**[read]** Limits ([Limits](https://docs.convex.dev/production/state/limits),
[Bundling](https://docs.convex.dev/functions/bundling#code-size-limits)):

- Code size is 230 MB per deployment, "source code and external packages".
- In the backend this is `MAX_UNZIPPED_PACKAGES_SIZE = 230_000_000`, checked on the whole unzipped
  package, source maps included
  (`crates/model/src/source_packages/types.rs`, error `ModulesTooLarge`).
- A push may not exceed `MAX_PUSH_BYTES` (200 MB) or `MAX_USER_MODULES` (4,096 modules)
  (`crates/common/src/knobs.rs`).
- I found **no per-module size limit**. Module sources live in one zipped source package in object
  storage, not in documents, so the 1 MiB document limit does not apply
  (`crates/model/src/source_packages/upload_download.rs`). `module_map.rs` sums source sizes only
  for metrics.
- The runtime heap limit is 64 MiB (`ISOLATE_MAX_USER_HEAP_SIZE`, and the "64 MiB RAM" row of Limits).

**[read]** Bundling in `convex` 1.49.0 (`src/bundler/index.ts`, `debugBundle.ts`):

- esbuild runs with `splitting: true` for app functions, so a list imported by one module is not
  copied into others.
- `sourcesContent: false` is the default (`bundler.includeSourcesContent`), so source maps do not
  repeat the 86 KB.
- Only `.js/.ts/...` files can be entry points. A `.ts` file that exports string constants is the
  safest format.

**[ran]** I built a test module outside the repo. It held four lists as one concatenated string each,
five letters per word, with no separators: EN guesses 8,882, EN solutions 1,760, IT guesses 4,711,
IT solutions 1,757.

- The source was 85,699 bytes.
- Bundled with `esbuild` 0.27.0 and the CLI's options, the output was 86,246 bytes plus a 904-byte map.
- That is 0.04% of the 230 MB limit.

**[ran]** Speed in Node 24 (V8, the engine Convex runs), three runs:

| Operation | Time |
|---|---|
| Import the module and build both guess `Set`s | 2.2–2.4 ms |
| `isValid(lang, word)` (a `Set.has`) | 11–12 ns |
| Pick a random solution (`Math.random`, then slice the string) | ~8 ns |
| Whole process heap | 7 MB |

**[inferred]** In Convex the module loads once per isolate or context, not once per call. A 2 ms
cold cost and a few MB of heap are far inside the 1 s and 64 MiB limits.

Cost of one call, module approach:

- **Validate a guess:** 0 database reads, 0 bytes of database I/O. It runs inside the guess mutation,
  which runs anyway.
- **Pick a solution:** 0 reads. **[read]** `Math.random()` in a mutation is a seeded strong PRNG that
  gives a new value on each run, but a value taken at module scope is fixed until the next deploy
  ([Runtimes](https://docs.convex.dev/functions/runtimes#using-randomness-and-time-in-queries-and-mutations)).
  So pick inside the handler, never at import time.

### Storing them in a table

Cost of one call, table approach **[inferred]**, from the limits and
[guidelines](../../convex/_generated/ai/guidelines.md):

- **Validate a guess:** one indexed lookup, for example
  `.withIndex("by_lang_and_word", q => q.eq("lang", l).eq("word", w)).unique()`. That is 1 index
  range, at most 1 document of about 100 bytes, against limits of 4,096 ranges and 16 MiB per
  transaction. The table never changes, so it adds no write conflicts. Database I/O is billed at
  1 GB/month free, so it is negligible at this app's scale.
- **Pick a solution:** Convex has no offset or skip. You need a dense `solutionIndex` field with an
  index, plus a known count N (a constant or a counter document). Then
  `eq("lang", l).eq("solutionIndex", floor(random() * N))` costs 1 range and 1 document. For offsets
  over changing data the guidelines point to `@convex-dev/aggregate`. Here the data never change,
  so a dense index is enough.
- **Seeding:** about 17,000 documents. `npx convex import --table` takes JSONL and has `--prod`,
  `--preview-name`, `--append` and `--replace`
  ([Data Import](https://docs.convex.dev/database/import-export/import)). An internal mutation is the
  other way, but it is capped at 16,000 documents written per transaction and 8,192 array elements
  per argument, so it needs batches.
- **The catch:** every deployment needs this seed: dev, prod, previews, and the local E2E backend
  with its Seed snapshots. `convex-test` also needs it in each test. A missing seed shows up only
  at runtime, as "every word rejected" or "no word to pick".

### Side by side

| | Module in `convex/` | Table |
|---|---|---|
| Fits the limits | yes, 86 KB of 230 MB | yes, about 17k small documents |
| Validate a guess | `Set.has`, 0 reads | 1 index read |
| Pick a solution | slice a string, 0 reads | 1 index read, plus a stored count |
| Reaches every deployment | on every push | separate import per deployment |
| Changing a list | a commit and deploy, reviewed in a PR | an import; no review trail |
| Tests (`convex-test`) | work as-is | must seed |

**[inferred]** The table only pays off if lists must change without a deploy, or grow past tens of
MB. Neither is in the map.

### One trap with the module

**[read]** The client already imports pure rule modules from `convex/`:

- `src/components/quiz-card.tsx` imports `../../convex/quizRules`.
- `src/lib/links.ts` imports `../../convex/linkRules`.

**[inferred]** If the Wordle rules module (scoring, colours) also imported the solution list, Vite
could pull the list into the Tauri client. Even then the word stays secret, but the pool of
possible words would be exposed. Keep the lists in their own module that only the server functions
import. The guess list is not secret, so shipping it to the client for instant feedback is a
choice, not a leak.

## What a spec should carry

1. **Sources and versions:** ESDB `rel-2026.02.25` for English. Morph-it! 0.4.8 plus wordfreq
   `large_it` for Italian.
2. **The letter rule:** five lowercase letters a–z. For Italian, also no accents, no apostrophes, and
   no j, k, w, x, y. Normalise the typed guess to lowercase before checking.
3. **Guesses must include every solution.** The build step should assert it.
4. **The build step itself:** a script that turns the sources into one generated `convex/` module.
   The rules (size cut, tag filter, frequency cut, review lists) should live in the script, so that
   regenerating gives the same output.
5. **Hand-review files kept in the repo:** an *exclude* list for solutions (offensive, odd, function
   words) and an *include* list for Italian guesses that Morph-it! lacks.
6. **Licence notices:**
   - The ESDB copyright notice must go "in all copies" and in "supporting documentation".
   - The Italian lists must be marked CC BY-SA (4.0 allowed), with credit to Baroni and Zanchetta
     (Morph-it!) and to wordfreq and its sources.
   - The notices go in the module header and in a notices file.
7. **Server-only solutions:** the solution list lives in a module the client never imports.
8. **Random pick inside the mutation handler,** not at module scope.

## Choices for the driving dev

- **Italian plurals and verb forms in solutions:**
  - (a) Rule A: all forms, ~2,150 words.
  - (b) Rule B: no conjugated verbs or participles, plurals allowed, ~1,760 words.
  - (c) Rule C: base forms only, no plurals, ~1,030 words.

  Guesses accept all forms in every case.
- **English plurals and verb forms in solutions:** base forms only, as in classic Wordle (~2,330, or
  ~1,760 after a frequency cut), or also common plurals and past tenses (size ≤ 35, all forms,
  ~3,620).
- **Frequency cut for solutions:** Zipf 3.0 (larger pool, harder words) or 3.5 (smaller, easier).
  Or, for English, none: the ESDB size alone, which keeps English free of CC BY-SA.
- **Filling Morph-it!'s guess gaps:**
  - (a) a hand-reviewed include list taken from wordfreq's top Italian five-letter words (886
    candidates at Zipf ≥ 3; most are names to skip);
  - (b) merging paroleitaliane's 660k list, with the unclear provenance;
  - (c) accepting the gaps.
- **British spellings:** accept *colour*-type words as English guesses (they are valid), and decide
  whether they can also be solutions.
- **Guess list on the client:** ship it for instant "not a word" feedback, or check on the server only.
- **Repeats:** whether the same pair of players may get a word they already had (needs a "used
  words" record), or pure random.
- **Where the credits show:** repo notices only, or also an in-app licences or about screen.

## Not verified

- **No real Convex deployment.** Nothing here was pushed to Convex. Bundle size and timings come from
  esbuild and Node with the CLI's options, not from a deployment's own figures.
- **Per-module limit.** The "no per-module limit" finding comes from reading the backend source at
  `94d904f`. The cloud service may enforce more.
- **Official ESDB output.** ESDB counts come from my own parser of `scowl-pre.txt`, not the official
  `./scowl word-list` tool, so the real numbers may differ by a few percent.
- **Morph-it! download.** The file came from a GitHub mirror. The original site
  (`docs.sslmit.unibo.it`) refused automated fetches (HTTP 402), so the file was not compared
  against the original.
- **No hand review.** Solution lists were sampled, not reviewed word by word.
- **Licences.** The readings above are not legal advice.

## Sources

- Repo at `527d798`: `convex/_generated/ai/guidelines.md`, `pnpm-lock.yaml`, `convex/quizRules.ts`,
  `src/components/quiz-card.tsx`, `src/lib/links.ts`, `src/components/conversation-view.tsx`.
- `convex` 1.49.0: `src/bundler/index.ts`, `src/bundler/debugBundle.ts`, `src/cli/lib/config.ts`,
  `src/cli/lib/components/definition/bundle.ts`.
- [get-convex/convex-backend](https://github.com/get-convex/convex-backend) at `94d904f`:
  `crates/model/src/source_packages/{types,upload_download}.rs`, `crates/common/src/knobs.rs`,
  `crates/isolate/src/module_map.rs`.
- Convex docs: [Limits](https://docs.convex.dev/production/state/limits),
  [Bundling](https://docs.convex.dev/functions/bundling),
  [Runtimes](https://docs.convex.dev/functions/runtimes),
  [Data Import](https://docs.convex.dev/database/import-export/import).
- [en-wl/wordlist](https://github.com/en-wl/wordlist) `rel-2026.02.25`: `Copyright`, `README.md`,
  `data/scowl-pre.txt`.
- Morph-it! 0.4.8: `readme-morph-it.txt` and `morph-it_048.txt` in
  [ellepannitto/morph-it-ud](https://github.com/ellepannitto/morph-it-ud) (`data/morph-it/`);
  [CC BY-SA 2.0 legal code](https://creativecommons.org/licenses/by-sa/2.0/legalcode).
- [rspeer/wordfreq](https://github.com/rspeer/wordfreq): README "License", `SUNSET.md`,
  `wordfreq/data/large_{it,en}.msgpack.gz`.
- [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords): README.
- [napolux/paroleitaliane](https://github.com/napolux/paroleitaliane): README, `LICENSE`, the
  60k/280k/660k lists, `lista_badwords.txt`.
- [pietroppeter/wordle-it](https://github.com/pietroppeter/wordle-it): README.
- [tabatkins/wordle-list](https://github.com/tabatkins/wordle-list),
  [dwyl/english-words](https://github.com/dwyl/english-words): READMEs.
- [LibreOffice/dictionaries `it_IT`](https://github.com/LibreOffice/dictionaries/tree/master/it_IT):
  `README_it_IT.txt`.
- [kaikki.org Italian](https://kaikki.org/dictionary/Italian/): download page.
