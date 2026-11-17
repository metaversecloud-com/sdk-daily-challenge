/*
 * Golden Letter mode scoring, shared by the server (which scores every word) and the client (which shows results
 * instantly), so both always agree.
 *
 * A word containing the day's golden letter scores double (once per word, however many golden letters it has).
 * Each golden word in a row adds a further 0.5x: x2, x2.5, x3, x3.5, then x4 at most. A non-golden word resets the
 * streak. Invalid attempts don't affect it.
 */

export const GOLDEN_BASE_MULTIPLIER = 2;
export const GOLDEN_STREAK_STEP = 0.5;
export const GOLDEN_MAX_MULTIPLIER = 4;

export const isGoldenWord = (word: string, goldenLetter: string | undefined) =>
  !!goldenLetter && word.toLowerCase().includes(goldenLetter.toLowerCase());

/** The multiplier for the nth golden word in a row (n starts at 1). */
export const getGoldenMultiplier = (streak: number) =>
  Math.min(GOLDEN_BASE_MULTIPLIER + GOLDEN_STREAK_STEP * Math.max(0, streak - 1), GOLDEN_MAX_MULTIPLIER);

/**
 * Scores a newly found word in golden mode. Returns its points, the multiplier applied (1 for a non-golden word),
 * and the streak after this word.
 */
export const scoreGoldenWord = (
  word: string,
  basePoints: number,
  goldenLetter: string | undefined,
  previousStreak: number,
) => {
  if (!isGoldenWord(word, goldenLetter)) return { points: basePoints, multiplier: 1, streak: 0 };
  const streak = previousStreak + 1;
  const multiplier = getGoldenMultiplier(streak);
  return { points: Math.round(basePoints * multiplier), multiplier, streak };
};

/** The medal a score earns against a board's goals, or null. */
export const getMedal = (score: number, goals: { bronze: number; silver: number; gold: number } | undefined) => {
  if (!goals) return null;
  if (score >= goals.gold) return "gold" as const;
  if (score >= goals.silver) return "silver" as const;
  if (score >= goals.bronze) return "bronze" as const;
  return null;
};
