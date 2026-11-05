import { randomUUID } from "crypto";
import { VisitorInterface } from "@rtsdk/topia";
import {
  WordHuntBoard,
  WordHuntGame,
  WordHuntStats,
  WordHuntStoredGame,
  WordHuntVisitorData,
} from "@shared/types/wordhunt/WordHuntTypes.js";
import { getVisitor } from "@utils/getVisitor.js";
import { standardizeError } from "@utils/standardizeError.js";
import { Visitor } from "@utils/topiaInit.js";
import { Credentials } from "../../types/index.js";
import { getNewBadgeNames, recordFinishedGame } from "./badges.js";
import { grantBadges } from "./grantBadges.js";
import { getDailyWordPoints } from "./board.js";
import { tryIsDailyLeader, tryRecordDailyScore } from "./leaderboard.js";
import { GAME_DURATION_MS, SUBMISSION_GRACE_MS } from "./constants.js";

type WorldScopedData = { [key: string]: any; wordhunt?: WordHuntVisitorData };

const getDataKey = ({ urlSlug, sceneDropId }: Credentials) => `${urlSlug}-${sceneDropId}`;
const getGamePath = (credentials: Credentials) => `${getDataKey(credentials)}.wordhunt.game`;

/** Converts a saved game to the API shape. Words from both the current map and the older list format are kept. */
export const fromStoredGame = (stored: WordHuntStoredGame): WordHuntGame => {
  const { found, foundWords: legacyFoundWords, score: _legacyScore, ...rest } = stored;
  const points = new Map<string, number>();
  for (const { word, points: value } of legacyFoundWords ?? []) points.set(word, value);
  for (const [word, value] of Object.entries(found ?? {})) points.set(word, value);

  const foundWords = [...points].map(([word, value]) => ({ word, points: value }));
  return { ...rest, foundWords, score: foundWords.reduce((total, { points: value }) => total + value, 0) };
};

/** Converts a game to the saved shape (found words as a map, score derived from it). */
export const toStoredGame = ({ foundWords, score: _score, ...rest }: WordHuntGame): WordHuntStoredGame => ({
  ...rest,
  found: Object.fromEntries(foundWords.map(({ word, points }) => [word, points])),
});

/*
 * In-memory copy of each player's current game, so submitting a word doesn't have to load the visitor's data
 * object first. A game's board and timer never change after it starts, and found words are added through
 * addFoundWord, so the copy stays accurate. If a request lands on another server instance, it just loads the
 * game from Topia once. Entries are dropped once their game can no longer accept words.
 */
const gameCache = new Map<string, WordHuntGame>();
const MAX_CACHED_GAMES = 5000;

const getCacheKey = ({ urlSlug, sceneDropId, visitorId }: Credentials) => `${urlSlug}-${sceneDropId}-${visitorId}`;

const cacheGame = (credentials: Credentials, game: WordHuntGame | null) => {
  const key = getCacheKey(credentials);
  if (!game || !isGameActive(game)) {
    gameCache.delete(key);
    return;
  }
  if (gameCache.size >= MAX_CACHED_GAMES) {
    for (const [cachedKey, cachedGame] of gameCache) if (!isGameActive(cachedGame)) gameCache.delete(cachedKey);
    if (gameCache.size >= MAX_CACHED_GAMES) gameCache.delete(gameCache.keys().next().value!);
  }
  gameCache.set(key, game);
};

/** The cached in-progress game with this id, or null if it isn't cached (or has ended). */
export const getCachedGame = (credentials: Credentials, gameId: unknown) => {
  const game = gameCache.get(getCacheKey(credentials));
  return game && game.gameId === gameId && isGameActive(game) ? game : null;
};

/** For tests. */
export const clearGameCache = () => gameCache.clear();

/**
 * Loads the visitor and their Word Hunt data, which lives on the visitor data object under the
 * per-world key `${urlSlug}-${sceneDropId}` (initialized by getVisitor).
 */
export const getWordHuntVisitor = async (credentials: Credentials, options: { includeInventory?: boolean } = {}) => {
  try {
    const { includeInventory = false } = options;
    const { visitor, visitorInventory } = await getVisitor(credentials, false, { includeInventory });
    const key = getDataKey(credentials);

    let dataObject = visitor.dataObject as { [key: string]: WorldScopedData } | undefined;
    // getVisitor may have just initialized the per-world key, in which case our cached copy is stale.
    if (!dataObject?.[key]) dataObject = (await visitor.fetchDataObject()) as { [key: string]: WorldScopedData };

    const stored = dataObject?.[key]?.wordhunt?.game;
    const game = stored ? fromStoredGame(stored) : null;
    const stats = dataObject?.[key]?.wordhunt?.stats as WordHuntStats | undefined;
    cacheGame(credentials, game);

    return { visitor, game, stats, visitorInventory };
  } catch (error) {
    throw standardizeError(error);
  }
};

/**
 * A visitor instance for saving to an existing game. Unlike getVisitor it makes no request to Topia, which is
 * safe here because the per-world key was already initialized when the game started.
 */
export const getVisitorForSave = (credentials: Credentials): VisitorInterface =>
  Visitor.create(credentials.visitorId, credentials.urlSlug, { credentials });

export const saveGame = async ({
  credentials,
  visitor,
  game,
  stats,
}: {
  credentials: Credentials;
  visitor: VisitorInterface;
  game: WordHuntGame;
  stats?: WordHuntStats;
}) => {
  try {
    // Dot-path keys so only the Word Hunt game (and stats) are replaced, leaving other per-world fields untouched.
    const prefix = `${getDataKey(credentials)}.wordhunt`;
    await visitor.updateDataObject(
      { [`${prefix}.game`]: toStoredGame(game), ...(stats && { [`${prefix}.stats`]: stats }) },
      {},
    );
    cacheGame(credentials, game);
  } catch (error) {
    throw standardizeError(error);
  }
};

/**
 * Saves one newly found word. Only that word's entry is written, so words submitted at the same time can't
 * overwrite each other. The word is added to `game` before saving (so a duplicate submitted meanwhile is
 * rejected) and removed again if the save fails.
 */
export const addFoundWord = async ({
  credentials,
  visitor,
  game,
  word,
  points,
}: {
  credentials: Credentials;
  visitor: VisitorInterface;
  game: WordHuntGame;
  word: string;
  points: number;
}) => {
  game.foundWords.push({ word, points });
  game.score += points;
  try {
    await visitor.updateDataObject({ [`${getGamePath(credentials)}.found.${word}`]: points }, {});
  } catch (error) {
    game.foundWords = game.foundWords.filter((found) => found.word !== word);
    game.score -= points;
    throw standardizeError(error);
  }
};

export const createGame = (board: WordHuntBoard, now = Date.now()): WordHuntGame => ({
  gameId: randomUUID(),
  board,
  startedAt: now,
  endsAt: now + GAME_DURATION_MS,
  endedAt: null,
  endReason: null,
  score: 0,
  foundWords: [],
});

export const isGameActive = (game: WordHuntGame | null, now = Date.now()): game is WordHuntGame =>
  !!game && !game.endedAt && now <= game.endsAt + SUBMISSION_GRACE_MS;

/**
 * Marks a game whose timer ran out (but was never explicitly ended, e.g. the drawer was closed)
 * as finished. Returns true if the game was changed and needs to be saved.
 */
export const finalizeIfExpired = (game: WordHuntGame | null, now = Date.now()) => {
  if (!game || game.endedAt || now <= game.endsAt + SUBMISSION_GRACE_MS) return false;
  game.endedAt = game.endsAt;
  game.endReason = "timeout";
  return true;
};

/**
 * Today's words and their points while `game` is in progress on today's board (so the client can check words
 * instantly), otherwise undefined.
 */
export const getValidWordsForGame = (game: WordHuntGame | null, today: string) =>
  isGameActive(game) && game.board.date === today ? getDailyWordPoints(today) : undefined;

/**
 * Records a game that has just ended on today's leaderboard, saves it with the player's updated lifetime stats,
 * then grants any badges those stats unlocked (including CROWN! if the score tops today's leaderboard).
 * Returns the names of the newly earned badges. Leaderboard and badge problems never fail the request.
 */
export const finishGame = async ({
  credentials,
  visitor,
  game,
  stats,
}: {
  credentials: Credentials;
  visitor: VisitorInterface;
  game: WordHuntGame;
  stats: WordHuntStats | undefined;
}) => {
  const nextStats = recordFinishedGame(stats, game);
  await tryRecordDailyScore({ credentials, game });
  if (!nextStats.wonCrown && (await tryIsDailyLeader({ credentials, game }))) nextStats.wonCrown = true;
  await saveGame({ credentials, visitor, game, stats: nextStats });
  const newBadges = getNewBadgeNames(stats, nextStats);
  await grantBadges({ credentials, visitor, names: newBadges });
  return newBadges;
};
