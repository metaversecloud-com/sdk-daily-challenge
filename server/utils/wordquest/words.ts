import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wordListPath = path.join(__dirname, "words.txt");

const rawWords = fs.readFileSync(wordListPath, "utf-8");

export const WORD_LIST: string[] = rawWords
  .split("\n")
  .map((w) => w.trim().toUpperCase())
  .filter((w) => w.length === WORD_LENGTH && /^[A-Z]+$/.test(w));

// Same list used for both valid guesses and possible daily answers.
export const ANSWER_LIST: string[] = WORD_LIST;