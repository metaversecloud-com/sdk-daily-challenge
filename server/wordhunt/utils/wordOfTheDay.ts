import { WordHuntGame, WordHuntWordOfTheDay } from "@shared/types/wordhunt/WordHuntTypes.js";
import { getBoardDate, getDailyWords } from "./board.js";
import { getPointsForWord } from "./constants.js";
import { getDefinition, getWordFrequency } from "./definitions.js";

/**
 * Picks the word of the day: the longest word that can be made on the board. When several words share that
 * length, prefer one with a definition, then the more common word, then alphabetical order.
 */
export const pickWordOfTheDay = (words: Iterable<string>): WordHuntWordOfTheDay | null => {
  const all = [...words];
  if (all.length === 0) return null;

  const longestLength = Math.max(...all.map((word) => word.length));
  const ranked = all
    .filter((word) => word.length === longestLength)
    .map((word) => ({ word, definition: getDefinition(word), frequency: getWordFrequency(word) }))
    .sort(
      (a, b) =>
        Number(!!b.definition) - Number(!!a.definition) || b.frequency - a.frequency || a.word.localeCompare(b.word),
    );

  const { word, definition } = ranked[0];
  return { word, points: getPointsForWord(word), definition };
};

const cache = new Map<string, WordHuntWordOfTheDay | null>();

/** The word of the day for a board date. Computed once per date, since every player gets the same board. */
export const getWordOfTheDay = (date = getBoardDate()) => {
  if (!cache.has(date)) {
    cache.clear(); // only today's word is ever needed
    cache.set(date, pickWordOfTheDay(getDailyWords(date)));
  }
  return cache.get(date) ?? null;
};

/**
 * The word of the day to include in a response, or undefined. It's only revealed once the player's game on
 * today's board has ended, so it can't be read from the network while they're still playing.
 */
export const getRevealedWordOfTheDay = (game: WordHuntGame | null) =>
  game?.endedAt && game.board.date === getBoardDate() ? getWordOfTheDay(game.board.date) ?? undefined : undefined;
