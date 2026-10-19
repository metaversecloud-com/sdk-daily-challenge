import {
  WordHuntBadge,
  WordHuntBadgeCategory,
  WordHuntGame,
  WordHuntStats,
} from "@shared/types/wordhunt/WordHuntTypes.js";

type BadgeDefinition = {
  slug: string;
  /** Must match the badge item name in the Topia ecosystem inventory. */
  name: string;
  description: string;
  category: WordHuntBadgeCategory;
  /** For badges that count something: how much is needed and how much the player has. */
  target?: number;
  current?: (stats: WordHuntStats) => number;
  isEarned: (stats: WordHuntStats) => boolean;
};

const atLeast = (current: (stats: WordHuntStats) => number, target: number) => ({
  target,
  current,
  isEarned: (stats: WordHuntStats) => current(stats) >= target,
});

export const BADGES: BadgeDefinition[] = [
  {
    slug: "streak-7-day",
    name: "7-Day Streak",
    description: "Play Word Hunt 7 days in a row.",
    category: "play",
    ...atLeast((s) => s.streak.best, 7),
  },
  {
    slug: "amateur-hunter",
    name: "Amateur Hunter",
    description: "Play Word Hunt for the first time.",
    category: "play",
    ...atLeast((s) => s.gamesPlayed, 1),
  },
  {
    slug: "novice-hunter",
    name: "Novice Hunter",
    description: "Play 5 Word Hunt games.",
    category: "play",
    ...atLeast((s) => s.gamesPlayed, 5),
  },
  {
    slug: "seasoned-hunter",
    name: "Seasoned Hunter",
    description: "Play 20 Word Hunt games.",
    category: "play",
    ...atLeast((s) => s.gamesPlayed, 20),
  },
  {
    slug: "score-5k",
    name: "5K Scorer",
    description: "Earn 5,000 points in one game.",
    category: "score",
    ...atLeast((s) => s.bestScore, 5000),
  },
  {
    slug: "score-10k",
    name: "10K Scorer",
    description: "Earn 10,000 points in one game.",
    category: "score",
    ...atLeast((s) => s.bestScore, 10000),
  },
  {
    slug: "score-15k",
    name: "15K Scorer",
    description: "Earn 15,000 points in one game.",
    category: "score",
    ...atLeast((s) => s.bestScore, 15000),
  },
  {
    slug: "score-20k",
    name: "20K Scorer",
    description: "Earn 20,000 points in one game.",
    category: "score",
    ...atLeast((s) => s.bestScore, 20000),
  },
  {
    slug: "score-100k-total",
    name: "100K Hoarder",
    description: "Earn 100,000 points across all your games.",
    category: "score",
    ...atLeast((s) => s.totalScore, 100000),
  },
  {
    slug: "found-topia",
    name: "Topia Finder",
    description: 'Find the word "Topia".',
    category: "special",
    isEarned: (s) => s.foundTopia,
  },
  {
    slug: "long-word",
    name: "Big Word Hunter",
    description: "Find a word with 7 or more letters.",
    category: "special",
    isEarned: (s) => s.foundLongWord,
  },
  {
    slug: "crown",
    name: "CROWN!",
    description: "Be the top player on the daily leaderboard.",
    category: "special",
    // TODO: awarded outside of a game (the daily winner is only known once the day is over), so it is not
    // derived from stats. It still shows as earned once the badge is in the player's inventory.
    isEarned: () => false,
  },
];

export const LONG_WORD_LENGTH = 7;
export const TOPIA_WORD = "topia";

export const emptyStats = (): WordHuntStats => ({
  gamesPlayed: 0,
  totalScore: 0,
  bestScore: 0,
  streak: { current: 0, best: 0, lastDate: null },
  foundTopia: false,
  foundLongWord: false,
});

/** Whole days since 1970-01-01 for a YYYY-MM-DD board date. */
const dayNumber = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
};

/** Returns new stats that include a game that just finished. Pure: does not change `stats`. */
export const recordFinishedGame = (stats: WordHuntStats | undefined, game: WordHuntGame): WordHuntStats => {
  const previous = { ...emptyStats(), ...stats, streak: { ...emptyStats().streak, ...stats?.streak } };
  const date = game.board.date;

  let { current, best, lastDate } = previous.streak;
  if (lastDate === null || dayNumber(date) > dayNumber(lastDate)) {
    current = lastDate !== null && dayNumber(date) - dayNumber(lastDate) === 1 ? current + 1 : 1;
    lastDate = date;
  }
  best = Math.max(best, current);

  return {
    gamesPlayed: previous.gamesPlayed + 1,
    totalScore: previous.totalScore + game.score,
    bestScore: Math.max(previous.bestScore, game.score),
    streak: { current, best, lastDate },
    foundTopia: previous.foundTopia || game.foundWords.some(({ word }) => word === TOPIA_WORD),
    foundLongWord: previous.foundLongWord || game.foundWords.some(({ word }) => word.length >= LONG_WORD_LENGTH),
  };
};

export const getEarnedNames = (stats: WordHuntStats | undefined) =>
  BADGES.filter((badge) => badge.isEarned({ ...emptyStats(), ...stats })).map((badge) => badge.name);

export const getNewBadgeNames = (before: WordHuntStats | undefined, after: WordHuntStats) => {
  const had = new Set(getEarnedNames(before));
  return getEarnedNames(after).filter((name) => !had.has(name));
};

/** The badge list for the Badges tab. A badge counts as earned if the stats say so or it is in the player's inventory. */
export const buildBadgeList = (
  stats: WordHuntStats | undefined,
  inventoryNames: Iterable<string> = [],
): WordHuntBadge[] => {
  const full = { ...emptyStats(), ...stats };
  const owned = new Set(inventoryNames);
  return BADGES.map((badge) => {
    const earned = badge.isEarned(full) || owned.has(badge.name);
    const progress =
      badge.target && badge.current ? { current: Math.min(badge.current(full), badge.target), target: badge.target } : null;
    return { slug: badge.slug, name: badge.name, description: badge.description, category: badge.category, earned, progress };
  });
};
