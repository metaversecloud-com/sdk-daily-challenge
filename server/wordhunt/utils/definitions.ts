import fs from "fs";
import path from "path";
import { WordHuntDefinition, WordHuntPartOfSpeech } from "@shared/types/wordhunt/WordHuntTypes.js";
import { TOPIA_WORD } from "./badges.js";

// Generated from WordNet by `npm run build:definitions` (see wordhunt/scripts/buildDefinitions.ts for the format).
// Resolved from the working directory like the dictionary, since the server always runs from `server/`.
const DEFINITIONS_PATH = path.resolve(process.cwd(), "wordhunt/data/definitions.tsv");

const PARTS_OF_SPEECH: Record<string, WordHuntPartOfSpeech> = { n: "noun", v: "verb", a: "adjective", r: "adverb" };

type DefinitionEntry = { baseWord: string; partOfSpeech: WordHuntPartOfSpeech; frequency: number; text: string };

let entries: Map<string, DefinitionEntry> | null = null;

/** Lazily loads and caches the definitions file. */
const getEntries = () => {
  if (!entries) {
    let raw: string;
    try {
      raw = fs.readFileSync(DEFINITIONS_PATH, "utf8");
    } catch (error) {
      throw new Error(`Unable to load Word Hunt definitions from ${DEFINITIONS_PATH}: ${error}`);
    }
    entries = new Map();
    for (const line of raw.split("\n")) {
      if (!line) continue;
      const [word, baseWord, pos, frequency, text] = line.split("\t");
      entries.set(word, { baseWord, partOfSpeech: PARTS_OF_SPEECH[pos], frequency: Number(frequency) || 0, text });
    }
    // "Topia" isn't in WordNet, but finding it earns a badge, so it gets its own definition.
    entries.set(TOPIA_WORD, {
      baseWord: "",
      partOfSpeech: "noun",
      frequency: 0,
      text: "the virtual world where you're playing Word Hunt",
    });
  }
  return entries;
};

/** The dictionary definition of a word (any letter case), or null if WordNet doesn't define it. */
export const getDefinition = (word: string): WordHuntDefinition | null => {
  const entry = getEntries().get(word.toLowerCase());
  if (!entry) return null;
  // Inflected forms leave the definition blank when it's the same as their base word's.
  const text = entry.text || getEntries().get(entry.baseWord)?.text;
  if (!text) return null;
  return { partOfSpeech: entry.partOfSpeech, text, baseWord: entry.baseWord || null };
};

/** How common a word's dictionary form is (higher is more common); 0 if unknown. */
export const getWordFrequency = (word: string) => getEntries().get(word.toLowerCase())?.frequency ?? 0;
