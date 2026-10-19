import fs from "fs";
import path from "path";
import { BLOCKED_EXACT_WORDS, BLOCKED_STEMS, BLOCKED_STEM_SUFFIXES, BLOCKED_SUBSTRINGS } from "../data/blockedWords.js";
import { TOPIA_WORD } from "./badges.js";
import { MIN_WORD_LENGTH } from "./constants.js";

// The server is always started from the `server/` directory (dev, prod, Docker, and Jest),
// so the dictionary path is resolved relative to the working directory. This also avoids
// `import.meta.url`, which ts-jest (CommonJS) can't compile.
const DICTIONARY_PATH = path.resolve(process.cwd(), "wordhunt/data/enable1.txt");

let dictionary: Set<string> | null = null;

const blockedExactWords = new Set([
  ...BLOCKED_EXACT_WORDS,
  ...BLOCKED_STEMS.flatMap((stem) => BLOCKED_STEM_SUFFIXES.map((suffix) => `${stem}${suffix}`)),
]);

export const isBlockedWord = (word: string) => {
  const lower = word.toLowerCase();
  if (blockedExactWords.has(lower)) return true;
  return BLOCKED_SUBSTRINGS.some((substring) => lower.includes(substring));
};

/**
 * Parses the raw ENABLE word list, keeping only lowercase a-z words that are long
 * enough to score and are appropriate for elementary-school players.
 */
export const parseDictionary = (raw: string) => {
  const words = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const word = line.trim().toLowerCase();
    if (word.length < MIN_WORD_LENGTH || !/^[a-z]+$/.test(word)) continue;
    if (isBlockedWord(word)) continue;
    words.add(word);
  }
  return words;
};

/** Lazily loads and caches the filtered dictionary. */
export const getDictionary = () => {
  if (!dictionary) {
    try {
      dictionary = parseDictionary(fs.readFileSync(DICTIONARY_PATH, "utf8"));
      // "Topia" is not in the ENABLE list, but finding it earns a badge.
      dictionary.add(TOPIA_WORD);
    } catch (error) {
      throw new Error(`Unable to load Word Hunt dictionary from ${DICTIONARY_PATH}: ${error}`);
    }
  }
  return dictionary;
};

export const isValidWord = (word: string) => getDictionary().has(word.toLowerCase());
