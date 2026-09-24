import { ANSWER_LIST } from "./words.js";

// Deterministic: same date always yields same word, no storage needed to reproduce it
export const pickDailyWord = (date: string): string => {
  let hash = 0;
  for (let i = 0; i < date.length; i++) {
    hash = (hash * 31 + date.charCodeAt(i)) >>> 0;
  }
  return ANSWER_LIST[hash % ANSWER_LIST.length];
};

export const getTodayDateString = (): string => new Date().toISOString().split("T")[0];