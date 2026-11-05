/**
 * Builds wordhunt/data/definitions.tsv from WordNet 3.1 (the `wordnet-db` dev dependency) for every
 * word in the ENABLE list that WordNet can define. The server only reads the generated file, so
 * WordNet itself is never needed at runtime.
 *
 * Usage (from server/):
 *   npm run build:definitions
 *
 * Output: one line per word, tab separated:
 *   word  baseWord  partOfSpeech  frequency  definition
 * - baseWord is empty when the word is itself a WordNet entry (e.g. "rematches" -> "rematch").
 * - partOfSpeech is n (noun), v (verb), a (adjective), or r (adverb).
 * - frequency is how often the base word appears in WordNet's tagged corpus; higher means more common.
 * - definition is empty when it's the same as the base word's own line, to keep the file small.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

type PartOfSpeech = "n" | "v" | "a" | "r";
type IndexEntry = { firstOffset: string };

const POS_FILES: Record<PartOfSpeech, string> = { n: "noun", v: "verb", a: "adj", r: "adv" };
// Order used to break ties between parts of speech with the same frequency.
const POS_ORDER: PartOfSpeech[] = ["n", "v", "a", "r"];

// WordNet's "morphy" suffix rules for turning an inflected form into its base form.
const DETACHMENT_RULES: Record<PartOfSpeech, [string, string][]> = {
  n: [["s", ""], ["ses", "s"], ["xes", "x"], ["zes", "z"], ["ches", "ch"], ["shes", "sh"], ["men", "man"], ["ies", "y"]],
  v: [["s", ""], ["ies", "y"], ["es", "e"], ["es", ""], ["ed", "e"], ["ed", ""], ["ing", "e"], ["ing", ""]],
  // "ier"/"iest" -> "y" (noisiest -> noisy) is in WordNet's exception list, which wordnet-db doesn't include.
  a: [["er", ""], ["est", ""], ["er", "e"], ["est", "e"], ["ier", "y"], ["iest", "y"]],
  r: [],
};

const require = createRequire(import.meta.url);
const WORDNET_DIR = path.join(path.dirname(require.resolve("wordnet-db/package.json")), "dict");
const ENABLE_PATH = path.resolve(process.cwd(), "wordhunt/data/enable1.txt");
const OUTPUT_PATH = path.resolve(process.cwd(), "wordhunt/data/definitions.tsv");

const readLines = (file: string) =>
  fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("  ")); // WordNet files start with an indented license header

/** lemma -> entry, per part of speech. Only single, lowercase words are kept (no phrases like "ice_cream"). */
const loadIndex = (pos: PartOfSpeech) => {
  const index = new Map<string, IndexEntry>();
  for (const line of readLines(path.join(WORDNET_DIR, `index.${POS_FILES[pos]}`))) {
    const fields = line.trim().split(" ");
    const lemma = fields[0];
    if (!/^[a-z]+$/.test(lemma)) continue;
    // Synset offsets are listed last, most common sense first.
    const synsetCount = Number(fields[2]);
    index.set(lemma, { firstOffset: fields[fields.length - synsetCount] });
  }
  return index;
};

/** "lemma|pos" -> how many times its senses were tagged in WordNet's corpus. */
const loadFrequencies = () => {
  const frequencies = new Map<string, number>();
  for (const line of readLines(path.join(WORDNET_DIR, "index.sense"))) {
    const [senseKey, , , tagCount] = line.split(" ");
    const [lemma, rest] = senseKey.split("%");
    // Sense key types: 1 noun, 2 verb, 3 adjective, 4 adverb, 5 adjective satellite.
    const pos = (["n", "v", "a", "r", "a"] as PartOfSpeech[])[Number(rest[0]) - 1];
    const key = `${lemma}|${pos}`;
    frequencies.set(key, (frequencies.get(key) ?? 0) + Number(tagCount));
  }
  return frequencies;
};

const dataFiles = new Map<PartOfSpeech, Buffer>();

/** The definition part of a synset's gloss, without its quoted usage examples. */
const loadGloss = (pos: PartOfSpeech, offset: string) => {
  if (!dataFiles.has(pos)) dataFiles.set(pos, fs.readFileSync(path.join(WORDNET_DIR, `data.${POS_FILES[pos]}`)));
  const data = dataFiles.get(pos)!;
  // Offsets are byte positions of the synset's line in the data file.
  const start = Number(offset);
  const line = data.toString("utf8", start, data.indexOf(10, start));
  const gloss = line.slice(line.indexOf(" | ") + 3).trim();
  return gloss.split(/;\s*"/)[0].replace(/\s+/g, " ").replace(/[;\s]+$/, "");
};

/** Base forms WordNet might list a word under, e.g. "fidgeted" -> verb "fidget". */
const getBaseCandidates = (word: string, pos: PartOfSpeech) => {
  const bases = [word];
  for (const [suffix, ending] of DETACHMENT_RULES[pos]) {
    if (!word.endsWith(suffix) || word.length <= suffix.length + 1) continue;
    const base = word.slice(0, -suffix.length) + ending;
    bases.push(base);
    // Doubled final consonant, e.g. "running" -> "run", "biggest" -> "big" (WordNet lists these as exceptions).
    if (ending === "" && /([b-df-hj-np-tv-z])\1$/.test(base)) bases.push(base.slice(0, -1));
  }
  return bases;
};

const build = () => {
  const indexes = Object.fromEntries(POS_ORDER.map((pos) => [pos, loadIndex(pos)])) as Record<
    PartOfSpeech,
    Map<string, IndexEntry>
  >;
  const frequencies = loadFrequencies();

  const words = fs
    .readFileSync(ENABLE_PATH, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((word) => word.length >= 3 && /^[a-z]+$/.test(word));

  const entries = new Map<string, { base: string; pos: PartOfSpeech; frequency: number; definition: string }>();
  for (const word of words) {
    // Prefer the word itself; only fall back to a base form when the word isn't a WordNet entry.
    let best: { base: string; pos: PartOfSpeech; frequency: number; isExact: boolean } | null = null;
    for (const pos of POS_ORDER) {
      for (const base of getBaseCandidates(word, pos)) {
        if (!indexes[pos].has(base)) continue;
        const candidate = { base, pos, frequency: frequencies.get(`${base}|${pos}`) ?? 0, isExact: base === word };
        const isBetter =
          !best ||
          (candidate.isExact && !best.isExact) ||
          (candidate.isExact === best.isExact && candidate.frequency > best.frequency);
        if (isBetter) best = candidate;
      }
    }
    if (!best) continue;

    const definition = loadGloss(best.pos, indexes[best.pos].get(best.base)!.firstOffset);
    if (!definition) continue;
    entries.set(word, { base: best.isExact ? "" : best.base, pos: best.pos, frequency: best.frequency, definition });
  }

  const lines = [...entries].map(([word, { base, pos, frequency, definition }]) => {
    const baseEntry = base ? entries.get(base) : undefined;
    const isSameAsBase = baseEntry && !baseEntry.base && baseEntry.pos === pos && baseEntry.definition === definition;
    return [word, base, pos, frequency, isSameAsBase ? "" : definition].join("\t");
  });

  fs.writeFileSync(OUTPUT_PATH, lines.join("\n") + "\n");
  console.log(`Wrote ${lines.length.toLocaleString()} of ${words.length.toLocaleString()} ENABLE words to ${OUTPUT_PATH}`);
};

build();
