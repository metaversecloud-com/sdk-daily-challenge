import { WordHuntGame, WordHuntWordOfTheDay } from "@shared/types/wordhunt/WordHuntTypes.js";
import { getBoardDate, getDailyWords, MAX_CACHED_DATES } from "./board.js";
import { getPointsForWord } from "./constants.js";
import { getDefinition, getWordFrequency } from "./definitions.js";

/**
 * Picks the word of the day: the longest word on the board that has a definition, so the results screen can
 * always explain it. When several words share that length, the more common word wins, then alphabetical order.
 * Only if no word on the board has a definition (never seen in practice) does it fall back to the longest word.
 */
export const pickWordOfTheDay = (words: Iterable<string>): WordHuntWordOfTheDay | null => {
  const all = [...words].map((word) => ({ word, definition: getDefinition(word) }));
  if (all.length === 0) return null;

  const defined = all.filter(({ definition }) => definition);
  const candidates = defined.length > 0 ? defined : all;

  const longestLength = Math.max(...candidates.map(({ word }) => word.length));
  const [{ word, definition }] = candidates
    .filter(({ word }) => word.length === longestLength)
    .map((candidate) => ({ ...candidate, frequency: getWordFrequency(candidate.word) }))
    .sort((a, b) => b.frequency - a.frequency || a.word.localeCompare(b.word));

  return { word, points: getPointsForWord(word), definition };
};

const cache = new Map<string, WordHuntWordOfTheDay | null>();

/** The word of the day for a board date. Computed once per date, since every player gets the same board. */
export const getWordOfTheDay = (date = getBoardDate()) => {
  if (!cache.has(date)) {
    cache.set(date, pickWordOfTheDay(getDailyWords(date)));
    // Keep the same few days as the board cache, oldest dropped first.
    if (cache.size > MAX_CACHED_DATES) cache.delete(cache.keys().next().value!);
  }
  return cache.get(date) ?? null;
};

/**
 * The word of the day to include in a response, or undefined. It's only revealed once the player's game on
 * today's board has ended, so it can't be read from the network while they're still playing.
 */
export const getRevealedWordOfTheDay = (game: WordHuntGame | null) =>
  game?.endedAt && game.board.date === getBoardDate() ? getWordOfTheDay(game.board.date) ?? undefined : undefined;
