import {
  ChallengeGameState,
  ChallengeMode,
  ChallengeRun,
  WordQuestVisitorData,
} from "@shared/types/WordQuestTypes.js";
import { MAX_GUESSES, WORD_LENGTH } from "../words.js";
import { pickDailyWord } from "../pickDailyWord.js";

export const CHALLENGE_WORD_COUNT = 3; // change to 5 if you want
export const TIMED_LIMIT_MS = 3 * 60 * 1000;

export const parseChallengeMode = (value: unknown): ChallengeMode | null =>
  value === "timed" || value === "suddenDeath" ? value : null;

// Distinct words, deterministic per visitor and day
export const pickChallengeWords = (date: string, profileId: string, pool: string[]): string[] => {
  const words: string[] = [];
  let salt = 0;
  while (words.length < CHALLENGE_WORD_COUNT && salt < 100) {
    const word = pickDailyWord(`${date}:${profileId}:challenge:${salt++}`, pool);
    if (!words.includes(word)) words.push(word);
  }
  return words;
};

export const createChallengeRun = (
  mode: ChallengeMode,
  date: string,
  words: string[],
  now = Date.now(),
): ChallengeRun => ({
  mode,
  date,
  words,
  wordIndex: 0,
  guesses: words.map(() => []),
  solved: words.map(() => false),
  status: "playing",
  startedAt: now,
  endsAt: mode === "timed" ? now + TIMED_LIMIT_MS : null,
  finishedAt: null,
});

// Today's run for a mode, or null (an older run doesn't count)
export const getTodaysRun = (data: WordQuestVisitorData, mode: ChallengeMode, today: string): ChallengeRun | null => {
  const run = data.challenge?.[mode];
  return run && run.date === today ? run : null;
};

// Run this first on every read and every guess (same idea as Word Hunt's finalizeIfExpired)
export const finalizeIfExpired = (run: ChallengeRun, now = Date.now()): boolean => {
  if (run.status === "playing" && run.endsAt !== null && now > run.endsAt) {
    run.status = "timeout";
    run.finishedAt = run.endsAt;
    return true;
  }
  return false;
};

// Call after the guess has been pushed onto run.guesses[run.wordIndex]
export const advanceChallenge = (run: ChallengeRun, solved: boolean, now = Date.now()) => {
  const outOfGuesses = !solved && run.guesses[run.wordIndex].length >= MAX_GUESSES;
  if (!solved && !outOfGuesses) return; // still guessing the same word

  run.solved[run.wordIndex] = solved;

  // Sudden death: one failed word ends the run
  if (outOfGuesses && run.mode === "suddenDeath") {
    run.status = "failed";
    run.finishedAt = now;
    return;
  }

  if (run.wordIndex === run.words.length - 1) {
    run.status = "complete";
    run.finishedAt = now;
  } else {
    run.wordIndex += 1;
  }
};

export const getChallengeScore = (run: ChallengeRun, now = Date.now()) => ({
  wordsSolved: run.solved.filter(Boolean).length,
  totalGuesses: run.guesses.reduce((n, g) => n + g.length, 0),
  timeLeftMs: run.endsAt ? Math.max(0, run.endsAt - (run.finishedAt ?? now)) : null,
});

// What the client may see. Answers are included only once the run is over.
export const toChallengeView = (mode: ChallengeMode, run: ChallengeRun | null, now = Date.now()): ChallengeGameState => {
  const base = { mode, wordCount: CHALLENGE_WORD_COUNT, maxGuesses: MAX_GUESSES, wordLength: WORD_LENGTH, serverTime: now };

  if (!run) {
    return { ...base, status: "notStarted", wordIndex: 0, guesses: [], solved: [], endsAt: null };
  }

  return {
    ...base,
    status: run.status,
    wordIndex: run.wordIndex,
    guesses: run.guesses[run.wordIndex],
    solved: run.solved,
    endsAt: run.endsAt,
    ...(run.status !== "playing" && { words: run.words, score: getChallengeScore(run, now) }),
  };
};