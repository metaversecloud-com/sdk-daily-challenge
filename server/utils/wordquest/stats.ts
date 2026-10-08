import { WordQuestStatsData } from "@shared/types/WordQuestTypes.js";
import { MAX_GUESSES } from "./words.js";

export const createDefaultStats = (): WordQuestStatsData  => ({
  gamesPlayed: 0,
  gamesWon: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastWonDate: null,
  guessDistribution: new Array(MAX_GUESSES).fill(0),
});

export const getYesterdayDateString = (): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
};

// Call when a game ends. Returns a new stats object.
export const recordGameResult = (
  stats: WordQuestStatsData ,
  won: boolean,
  guessesUsed: number,
  today: string,
): WordQuestStatsData => {
  const next: WordQuestStatsData  = { ...stats, guessDistribution: [...stats.guessDistribution] };
  next.gamesPlayed += 1;

  if (won) {
    next.gamesWon += 1;
    next.guessDistribution[guessesUsed - 1] += 1;
    next.currentStreak = stats.lastWonDate === getYesterdayDateString() ? stats.currentStreak + 1 : 1;
    next.maxStreak = Math.max(next.maxStreak, next.currentStreak);
    next.lastWonDate = today;
  } else {
    next.currentStreak = 0;
  }
  return next;
};