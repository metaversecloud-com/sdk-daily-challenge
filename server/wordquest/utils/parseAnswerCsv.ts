import { MAX_CUSTOM_ANSWERS, WORD_BANK_SET, WORD_LENGTH } from "./words.js";

export interface ParseResult {
  valid: string[];
  rejected: { word: string; reason: string }[];
  error?: string;
}

const HEADERS = new Set(["word", "words", "answer", "answers"]);

export const parseAnswerCsv = (csv: string): ParseResult => {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0] && HEADERS.has(lines[0].trim().toLowerCase())) lines.shift();

  const tokens = lines
    .join("\n")
    .split(/[\s,;]+/)
    .map((t) => t.replace(/["']/g, "").trim().toUpperCase())
    .filter(Boolean);

  const valid = new Set<string>();
  const rejected: ParseResult["rejected"] = [];

  for (const word of tokens) {
    if (!/^[A-Z]+$/.test(word) || word.length !== WORD_LENGTH) {
      rejected.push({ word, reason: `Must be ${WORD_LENGTH} letters` });
    } else if (!WORD_BANK_SET.has(word)) {
      rejected.push({ word, reason: "Not in the word bank" });
    } else {
      valid.add(word); // duplicates collapse here
    }
  }

  if (valid.size === 0) return { valid: [], rejected, error: "No valid words found in the file." };
  if (valid.size > MAX_CUSTOM_ANSWERS) {
    return { valid: [], rejected, error: `Too many words (${valid.size}). The limit is ${MAX_CUSTOM_ANSWERS}.` };
  }
  return { valid: Array.from(valid), rejected };
};