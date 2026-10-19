import fs from "fs";
import path from "path";

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;
export const MAX_CUSTOM_ANSWERS = 500;

// The server is always started from the `server/` directory (dev, prod, Docker, and Jest), so the word lists are
// resolved relative to the working directory. This avoids `import.meta.url`, which ts-jest (CommonJS) can't compile.
const WORD_LIST_DIR = path.resolve(process.cwd(), "utils/wordquest");

const loadList = (file: string): string[] => {
  const fullPath = path.join(WORD_LIST_DIR, file);
  if (!fs.existsSync(fullPath)) return [];
  return fs
    .readFileSync(fullPath, "utf-8")
    .split(/\r?\n/)
    .map((w) => w.trim().toUpperCase())
    .filter((w) => w.length === WORD_LENGTH && /^[A-Z]+$/.test(w));
};

// Word bank: everything a player may guess
export const WORD_BANK: string[] = Array.from(new Set(loadList("wordlist.txt")));
export const WORD_BANK_SET = new Set(WORD_BANK);
export const WORD_LIST = WORD_BANK; // alias so handleSubmitGuess.ts keeps working

// Default answers: a subset of the bank
const defaults = Array.from(new Set(loadList("answerlist.txt"))).filter((w) => WORD_BANK_SET.has(w));
if (defaults.length === 0) {
  console.warn("answerlist.txt is missing, empty, or has no words from the bank. Using the whole bank.");
}
export const DEFAULT_ANSWER_LIST: string[] = defaults.length ? defaults : WORD_BANK;

if (WORD_BANK.length === 0) {
  console.warn("wordlist.txt has no 5-letter words. Check the file name and contents.");
}