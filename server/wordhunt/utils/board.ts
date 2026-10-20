import { WordHuntBoard } from "@shared/types/wordhunt/WordHuntTypes.js";
import { BOARD_SIZE, BOARD_TIMEZONE, LETTER_DICE, MAX_BOARD_ATTEMPTS, MIN_WORDS_PER_BOARD } from "./constants.js";
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

const boardCache = new Map<string, WordHuntBoard>();

/**
 * Returns the board for the given date. The board is generated deterministically from the date,
 * so every player (and every server instance) gets the same board on the same day.
 */
export const getDailyBoard = (date = getBoardDate()): WordHuntBoard => {
  const cached = boardCache.get(date);
  if (cached) return cached;

  let bestTiles: string[] = [];
  let bestCount = -1;
  for (let attempt = 0; attempt < MAX_BOARD_ATTEMPTS; attempt++) {
    const tiles = rollTiles(createRandom(hashString(`wordhunt-${date}-${attempt}`)));
    const count = findAllWords(tiles).size;
    if (count > bestCount) {
      bestTiles = tiles;
      bestCount = count;
    }
    if (count >= MIN_WORDS_PER_BOARD) break;
  }

  const board: WordHuntBoard = { date, size: BOARD_SIZE, tiles: bestTiles };
  boardCache.clear(); // only today's board is ever needed
  boardCache.set(date, board);
  return board;
};
