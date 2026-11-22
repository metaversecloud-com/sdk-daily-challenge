import type { ChallengeRun, WordQuestStatsData } from "@shared/types/WordQuestTypes";
import { BADGES, type BadgeName } from "./badgeCatalog.js";

/**
 * Daily word badges, worked out from the saved stats alone.
 * Safe to call after every game: awarding skips badges the visitor already has,
 * so it also back-fills players who qualified before badges existed.
 */
export const evaluateDailyBadges = (stats: WordQuestStatsData): BadgeName[] => {
  const dist = stats.guessDistribution ?? [];
  const solvedIn = (max: number) => dist.slice(0, max).some((n) => n > 0);
  const earned: BadgeName[] = [];

  if (stats.gamesWon >= 1) earned.push(BADGES.firstWin);
  if (stats.maxStreak >= 3) earned.push(BADGES.hotStreak);
  if (stats.maxStreak >= 7) earned.push(BADGES.weekWarrior);
  if (stats.maxStreak >= 30) earned.push(BADGES.monthMaster);
  if (solvedIn(1)) earned.push(BADGES.holeInOne);
  if (solvedIn(3)) earned.push(BADGES.quickDraw);
  if ((dist[5] ?? 0) > 0) earned.push(BADGES.closeCall);
  if (stats.gamesPlayed >= 10) earned.push(BADGES.regular);
  if (stats.gamesWon >= 100) earned.push(BADGES.century);
  return earned;
};

/**
 * Single-run Timed / One Shot badges. Call once, when the run has just ended.
 * Podium, Time Keeper, Iron Will and the across-modes badges need leaderboard
 * rank or saved counters, so they are a later step.
 */
export const evaluateChallengeBadges = (run: ChallengeRun): BadgeName[] => {
  if (run.status === "playing") return [];

  const solvedCount = run.solved.filter(Boolean).length;
  const complete = run.status === "complete";
  const totalGuesses = run.guesses.reduce((sum, g) => sum + g.length, 0);
  const earned: BadgeName[] = [];

  if (run.mode === "timed") {
    const timeLeftMs = run.endsAt !== null && run.finishedAt !== null ? run.endsAt - run.finishedAt : null;
    if (solvedCount >= 1) earned.push(BADGES.firstTick);
    if (complete) earned.push(BADGES.beatTheClock);
    if (complete && timeLeftMs !== null && timeLeftMs >= 90_000) earned.push(BADGES.speedDemon);
    if (complete && timeLeftMs !== null && timeLeftMs >= 0 && timeLeftMs < 10_000) earned.push(BADGES.photoFinish);
    if (complete && totalGuesses <= 9) earned.push(BADGES.efficient);
  } else {
    const lastIndex = run.words.length - 1;
    if (solvedCount >= 1) earned.push(BADGES.openingShot);
    if (complete) earned.push(BADGES.survivor);
    if (complete && totalGuesses <= 10) earned.push(BADGES.sharpshooter);
    if (run.solved.some((ok, i) => ok && run.guesses[i]?.length === 1)) earned.push(BADGES.luckyStrike);
    if (complete && run.guesses[lastIndex]?.length === 6) earned.push(BADGES.nervesOfSteel);
  }
  return earned;
};