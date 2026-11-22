import {
  WordHuntAnalyticsCounters,
  WordHuntAnalyticsDay,
  WordHuntAnalyticsResponse,
  WordHuntAnalyticsSummary,
} from "@shared/types/wordhunt/WordHuntTypes.js";

/*
 * Pure helpers for Word Hunt's analytics counters (no Topia SDK), shared by the server and the dev mock server.
 */

export const ANALYTICS_COUNTERS: (keyof WordHuntAnalyticsCounters)[] = [
  "gamesStarted",
  "gamesCompleted",
  "gamesQuit",
  "gamesTimedOut",
  "gamesWithNoWords",
  "wordsFound",
  "pointsScored",
  "secondsPlayed",
  "longWordsFound",
  "wordOfTheDayFound",
  "goldenLetterWordsFound",
  "goalsBronze",
  "goalsSilver",
  "goalsGold",
];

export const MAX_ANALYTICS_DAYS = 90;

export const emptyCounters = (): WordHuntAnalyticsCounters =>
  Object.fromEntries(ANALYTICS_COUNTERS.map((name) => [name, 0])) as unknown as WordHuntAnalyticsCounters;

/** Reads stored counters, treating missing or malformed values as 0. */
export const toCounters = (stored: unknown): WordHuntAnalyticsCounters => {
  const counters = emptyCounters();
  if (stored && typeof stored === "object") {
    for (const name of ANALYTICS_COUNTERS) {
      const value = Number((stored as Record<string, unknown>)[name]);
      if (Number.isFinite(value)) counters[name] = value;
    }
  }
  return counters;
};

const ratio = (part: number, whole: number, decimals = 2) =>
  whole > 0 ? Math.round((part / whole) * 10 ** decimals) / 10 ** decimals : null;

export const summarize = (counters: WordHuntAnalyticsCounters): WordHuntAnalyticsSummary => ({
  ...counters,
  completionRate: ratio(counters.gamesCompleted, counters.gamesStarted),
  quitRate: ratio(counters.gamesQuit, counters.gamesCompleted),
  averageWordsFound: ratio(counters.wordsFound, counters.gamesCompleted, 1),
  averageScore: ratio(counters.pointsScored, counters.gamesCompleted, 0),
  averageSecondsPlayed: ratio(counters.secondsPlayed, counters.gamesCompleted, 0),
  wordOfTheDayFindRate: ratio(counters.wordOfTheDayFound, counters.gamesCompleted),
  averageGoldenLetterWords: ratio(counters.goldenLetterWordsFound, counters.gamesCompleted, 1),
  goalReachedRate: ratio(counters.goalsBronze + counters.goalsSilver + counters.goalsGold, counters.gamesCompleted),
});

/** The `days` board dates ending at (and including) `today`, newest first. */
export const getRecentDates = (today: string, days: number) => {
  const [year, month, day] = today.split("-").map(Number);
  return Array.from({ length: days }, (_, offset) =>
    new Date(Date.UTC(year, month - 1, day - offset)).toISOString().slice(0, 10),
  );
};

/** Adds several stored `{ [date]: counters }` maps (e.g. one per game mode) into one. */
export const combineStoredCounters = (maps: (Record<string, unknown> | undefined)[]) => {
  const combined: Record<string, WordHuntAnalyticsCounters> = {};
  for (const map of maps) {
    for (const [date, stored] of Object.entries(map ?? {})) {
      const counters = toCounters(stored);
      const total = (combined[date] ??= emptyCounters());
      for (const name of ANALYTICS_COUNTERS) total[name] += counters[name];
    }
  }
  return combined;
};

/** Builds the analytics response from the stored `{ [date]: counters }` map. */
export const buildAnalyticsResponse = (
  stored: Record<string, unknown> | undefined,
  today: string,
  days: number,
): WordHuntAnalyticsResponse => {
  const totals = emptyCounters();
  const dayList: WordHuntAnalyticsDay[] = getRecentDates(today, days).map((date) => {
    const counters = toCounters(stored?.[date]);
    for (const name of ANALYTICS_COUNTERS) totals[name] += counters[name];
    return { date, ...summarize(counters) };
  });
  return { days: dayList, totals: summarize(totals) };
};

/** The counter increments for one finished game. */
export const getFinishedGameIncrements = ({
  wordsFound,
  score,
  secondsPlayed,
  endReason,
  longWordsFound,
  foundWordOfTheDay,
  goldenLetterWordsFound = 0,
  medal = null,
}: {
  wordsFound: number;
  score: number;
  secondsPlayed: number;
  endReason: "quit" | "timeout" | null;
  longWordsFound: number;
  foundWordOfTheDay: boolean;
  /** Golden mode only. */
  goldenLetterWordsFound?: number;
  medal?: "bronze" | "silver" | "gold" | null;
}): Partial<WordHuntAnalyticsCounters> => {
  const increments: Partial<WordHuntAnalyticsCounters> = {
    gamesCompleted: 1,
    [endReason === "quit" ? "gamesQuit" : "gamesTimedOut"]: 1,
    wordsFound,
    pointsScored: score,
    secondsPlayed,
    longWordsFound,
    wordOfTheDayFound: foundWordOfTheDay ? 1 : 0,
    gamesWithNoWords: wordsFound === 0 ? 1 : 0,
    goldenLetterWordsFound,
    ...(medal && { [`goals${medal[0].toUpperCase()}${medal.slice(1)}`]: 1 }),
  };
  // Skip zeros so a finished game only sends the counters it actually changes.
  return Object.fromEntries(Object.entries(increments).filter(([, value]) => value)) as Partial<WordHuntAnalyticsCounters>;
};
