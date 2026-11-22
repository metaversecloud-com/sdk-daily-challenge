import { WordHuntBoard, WordHuntGoals, WordHuntMode } from "@shared/types/wordhunt/WordHuntTypes.js";
import { isGoldenWord } from "@shared/wordhunt/golden.js";
import {
  BOARD_SIZE,
  BOARD_TIMEZONE,
  getPointsForWord,
  LETTER_DICE,
  MAX_BOARD_ATTEMPTS,
  MIN_WORDS_PER_BOARD,
} from "./constants.js";
import { getWordFrequency } from "./definitions.js";
import { getDictionary } from "./dictionary.js";

/** Today's date (YYYY-MM-DD) in the board timezone. */
export const getBoardDate = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: BOARD_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    now,
  );

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

// mulberry32: small deterministic PRNG so every player gets the same board for a given date.
const createRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const rollTiles = (random: () => number) => {
  const dice = [...LETTER_DICE];
  for (let i = dice.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [dice[i], dice[j]] = [dice[j], dice[i]];
  }
  return dice.slice(0, BOARD_SIZE * BOARD_SIZE).map((die) => die[Math.floor(random() * die.length)]);
};

export const areAdjacent = (a: number, b: number, size = BOARD_SIZE) => {
  const rowDiff = Math.abs(Math.floor(a / size) - Math.floor(b / size));
  const colDiff = Math.abs((a % size) - (b % size));
  return a !== b && rowDiff <= 1 && colDiff <= 1;
};

/**
 * Validates that a path is a list of unique, in-bounds, adjacent tile indexes and returns the
 * word it spells (lowercase), or null if the path is invalid.
 */
export const getWordFromPath = (board: WordHuntBoard, path: unknown): string | null => {
  if (!Array.isArray(path) || path.length === 0 || path.length > board.tiles.length) return null;

  const seen = new Set<number>();
  for (let i = 0; i < path.length; i++) {
    const index = path[i];
    if (!Number.isInteger(index) || index < 0 || index >= board.tiles.length || seen.has(index)) return null;
    if (i > 0 && !areAdjacent(path[i - 1], index, board.size)) return null;
    seen.add(index);
  }

  return path.map((index: number) => board.tiles[index]).join("").toLowerCase();
};

/** Finds every dictionary word that can be formed on the board. */
export const findAllWords = (tiles: string[], size = BOARD_SIZE) => {
  const lowerTiles = tiles.map((tile) => tile.toLowerCase());
  const boardLetters = new Set(lowerTiles.join(""));

  // Only words made entirely of letters on the board can possibly be found, which keeps the prefix set small.
  const candidates = [...getDictionary()].filter((word) => [...word].every((letter) => boardLetters.has(letter)));
  const words = new Set(candidates);
  const prefixes = new Set<string>();
  for (const word of candidates) {
    for (let i = 1; i <= word.length; i++) prefixes.add(word.slice(0, i));
  }

  const found = new Set<string>();
  const visited = new Array(tiles.length).fill(false);

  const search = (index: number, current: string) => {
    const next = current + lowerTiles[index];
    if (!prefixes.has(next)) return;
    if (words.has(next)) found.add(next);

    visited[index] = true;
    for (let neighbor = 0; neighbor < tiles.length; neighbor++) {
      if (!visited[neighbor] && areAdjacent(index, neighbor, size)) search(neighbor, next);
    }
    visited[index] = false;
  };

  for (let i = 0; i < tiles.length; i++) search(i, "");
  return found;
};

const boardCache = new Map<string, { board: WordHuntBoard; words: Set<string> }>();
// Today's boards plus a few earlier ones (finishing an old, abandoned game looks up that day's words), so an
// earlier day's lookup doesn't evict today's board and force it to be rebuilt.
export const MAX_CACHED_DATES = 3;

/*
 * Golden mode. The golden letter should be found in a fair share of the board's words: on real boards a letter can
 * appear in anywhere from 0% to 70%+ of them, which would make the bonus either useless or nearly automatic.
 */
const GOLDEN_SHARE_MIN = 0.15;
const GOLDEN_SHARE_MAX = 0.35;
const GOLDEN_SHARE_TARGET = 0.25;
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

/** Number of easiest words a player would need for each goal (easiest = shortest, then most common). */
export const GOAL_WORD_COUNTS = { bronze: 8, silver: 15, gold: 25 } as const;

/**
 * Picks the golden letter for a board: a single-letter tile (never "Qu") found in 15-35% of its words, preferring
 * consonants and letters on fewer tiles (so players have to hunt for them). Ties are broken by the date, so the
 * pick is the same for everyone. If no letter is in that range (rare), the one closest to 25% is used.
 */
export const pickGoldenLetter = (tiles: string[], words: Set<string>, seed: string) => {
  const wordList = [...words];
  const letters = [...new Set(tiles.filter((tile) => tile.length === 1).map((tile) => tile.toLowerCase()))];
  const candidates = letters
    .map((letter) => ({
      letter,
      share: wordList.length ? wordList.filter((word) => word.includes(letter)).length / wordList.length : 0,
      tileCount: tiles.filter((tile) => tile.toLowerCase() === letter).length,
      isVowel: VOWELS.has(letter),
      tieBreak: hashString(`${seed}-${letter}`),
    }))
    .filter(({ share }) => share > 0);
  if (candidates.length === 0) return undefined;

  const inRange = candidates.filter(({ share }) => share >= GOLDEN_SHARE_MIN && share <= GOLDEN_SHARE_MAX);
  const pool = inRange.length
    ? inRange.sort((a, b) => Number(a.isVowel) - Number(b.isVowel) || a.tileCount - b.tileCount || a.tieBreak - b.tieBreak)
    : candidates.sort((a, b) => Math.abs(a.share - GOLDEN_SHARE_TARGET) - Math.abs(b.share - GOLDEN_SHARE_TARGET));
  return pool[0].letter;
};

/**
 * Bronze, silver, and gold targets: the points a player would get from the board's 8, 15, and 25 easiest words
 * (shortest first, then most common), with golden words doubled. This scales with how rich the board is
 * (boards range from about 64k to 440k total points) while staying reachable. Rounded to the nearest 100.
 */
export const getGoals = (words: Set<string>, goldenLetter: string | undefined): WordHuntGoals => {
  const ranked = [...words].sort(
    (a, b) => a.length - b.length || getWordFrequency(b) - getWordFrequency(a) || a.localeCompare(b),
  );
  const points = ranked.map((word) => getPointsForWord(word) * (isGoldenWord(word, goldenLetter) ? 2 : 1));
  const total = (count: number) => Math.round(points.slice(0, count).reduce((sum, value) => sum + value, 0) / 100) * 100;
  const bronze = Math.max(total(GOAL_WORD_COUNTS.bronze), 100);
  const silver = Math.max(total(GOAL_WORD_COUNTS.silver), bronze + 100);
  const gold = Math.max(total(GOAL_WORD_COUNTS.gold), silver + 100);
  return { bronze, silver, gold };
};

const getCacheKey = (date: string, mode: WordHuntMode) => `${mode}:${date}`;

/**
 * Returns the board for the given date and mode. Each mode's board is generated deterministically from the date
 * (with its own seed, so the modes have different boards), so every player and every server instance gets the
 * same board on the same day. Golden boards also carry the golden letter and score goals.
 */
export const getDailyBoard = (date = getBoardDate(), mode: WordHuntMode = "classic"): WordHuntBoard => {
  const key = getCacheKey(date, mode);
  const cached = boardCache.get(key);
  if (cached) return cached.board;

  // Classic keeps its original seed, so classic boards are unchanged.
  const seedPrefix = mode === "classic" ? "wordhunt" : `wordhunt-${mode}`;
  let bestTiles: string[] = [];
  let bestWords = new Set<string>();
  for (let attempt = 0; attempt < MAX_BOARD_ATTEMPTS; attempt++) {
    const tiles = rollTiles(createRandom(hashString(`${seedPrefix}-${date}-${attempt}`)));
    const words = findAllWords(tiles);
    if (words.size > bestWords.size || attempt === 0) {
      bestTiles = tiles;
      bestWords = words;
    }
    if (words.size >= MIN_WORDS_PER_BOARD) break;
  }

  const board: WordHuntBoard = { date, size: BOARD_SIZE, tiles: bestTiles };
  if (mode === "golden") {
    board.goldenLetter = pickGoldenLetter(bestTiles, bestWords, `${seedPrefix}-${date}`);
    board.goals = getGoals(bestWords, board.goldenLetter);
  }
  boardCache.set(key, { board, words: bestWords });
  // Two modes per day, so keep both modes for the last few days.
  if (boardCache.size > MAX_CACHED_DATES * 2) boardCache.delete(boardCache.keys().next().value!);
  return board;
};

/** Every dictionary word that can be made on the given day's board (computed once along with the board). */
export const getDailyWords = (date = getBoardDate(), mode: WordHuntMode = "classic") => {
  getDailyBoard(date, mode);
  return boardCache.get(getCacheKey(date, mode))!.words;
};

/**
 * Every word on the given day's board with its base points, for the client to check words instantly.
 * (In golden mode the client applies the golden multiplier itself, with the shared scoring rules.)
 */
export const getDailyWordPoints = (date = getBoardDate(), mode: WordHuntMode = "classic"): Record<string, number> =>
  Object.fromEntries([...getDailyWords(date, mode)].map((word) => [word, getPointsForWord(word)]));
