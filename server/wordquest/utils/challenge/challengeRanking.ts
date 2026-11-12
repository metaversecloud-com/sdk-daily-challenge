import type { ChallengeMode } from "@shared/types/WordQuestTypes.js";

export interface LeaderboardEntry {
  displayName: string;
  wordsSolved: number;
  totalGuesses: number;
  timeLeftMs: number | null;
  runs: number;
}

export const boardKey = (mode: ChallengeMode) => `${mode}Leaderboard`; // timedLeaderboard, oneshotLeaderboard

export const serializeEntry = (e: LeaderboardEntry) =>
  [e.displayName.replace(/\|/g, " "), e.wordsSolved, e.totalGuesses, e.timeLeftMs ?? "", e.runs].join("|");

export const parseEntry = (raw: unknown): LeaderboardEntry | null => {
  if (typeof raw !== "string") return null;
  const [displayName, words, guesses, time, runs] = raw.split("|");
  const wordsSolved = Number(words);
  const totalGuesses = Number(guesses);
  if (!displayName || Number.isNaN(wordsSolved) || Number.isNaN(totalGuesses)) return null;
  return {
    displayName,
    wordsSolved,
    totalGuesses,
    timeLeftMs: time === undefined || time === "" ? null : Number(time),
    runs: Number(runs) || 1,
  };
};

// True when a is a better run than b
export const isBetter = (mode: ChallengeMode, a: LeaderboardEntry, b: LeaderboardEntry) => {
  if (a.wordsSolved !== b.wordsSolved) return a.wordsSolved > b.wordsSolved;
  if (mode === "timed") return (a.timeLeftMs ?? 0) > (b.timeLeftMs ?? 0);
  return a.totalGuesses < b.totalGuesses;
};

export const sortEntries = (mode: ChallengeMode, entries: LeaderboardEntry[]) =>
  [...entries].sort((a, b) => (isBetter(mode, a, b) ? -1 : isBetter(mode, b, a) ? 1 : 0));