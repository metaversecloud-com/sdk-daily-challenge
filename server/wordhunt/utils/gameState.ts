import { randomUUID } from "crypto";
import { AnalyticType, VisitorInterface } from "@rtsdk/topia";
import {
  WORD_HUNT_MODES,
  WordHuntBoard,
  WordHuntGame,
  WordHuntMode,
  WordHuntModeStatus,
  WordHuntStats,
  WordHuntStoredGame,
  WordHuntVisitorData,
} from "@shared/types/wordhunt/WordHuntTypes.js";
import { getVisitor } from "@utils/getVisitor.js";
import { standardizeError } from "@utils/standardizeError.js";
import { Visitor } from "@utils/topiaInit.js";
import { Credentials } from "../../types/index.js";
import { getGameFinishedAnalytics, recordGameFinished } from "./analytics.js";
import { getNewBadgeNames, recordFinishedGame, recordFinishedGoldenGame } from "./badges.js";
import { grantBadges } from "./grantBadges.js";
import { getBoardDate, getDailyWordPoints } from "./board.js";
import { getGameMode } from "./mode.js";
import { GAME_DURATION_MS, SUBMISSION_GRACE_MS } from "./constants.js";

type WorldScopedData = { [key: string]: any; wordhunt?: WordHuntVisitorData & { golden?: WordHuntVisitorData } };

const getDataKey = ({ urlSlug, sceneDropId }: Credentials) => `${urlSlug}-${sceneDropId}`;
/**
 * Where a mode's data lives on the visitor data object. Classic keeps its original location (so existing games and
 * stats carry over); golden games live under `.wordhunt.golden`.
 */
const getModePath = (credentials: Credentials, mode: WordHuntMode) =>
  `${getDataKey(credentials)}.wordhunt${mode === "classic" ? "" : `.${mode}`}`;
const getGamePath = (credentials: Credentials, mode: WordHuntMode) => `${getModePath(credentials, mode)}.game`;


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

const getCacheKey = ({ urlSlug, sceneDropId, visitorId }: Credentials, mode: WordHuntMode) =>
  `${urlSlug}-${sceneDropId}-${visitorId}-${mode}`;

const cacheGame = (credentials: Credentials, mode: WordHuntMode, game: WordHuntGame | null) => {
  const key = getCacheKey(credentials, mode);
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
export const getCachedGame = (credentials: Credentials, mode: WordHuntMode, gameId: unknown) => {
  const game = gameCache.get(getCacheKey(credentials, mode));
  return game && game.gameId === gameId && isGameActive(game) ? game : null;
};

/** For tests. */
export const clearGameCache = () => gameCache.clear();

/** Whether the player hasn't started today's board in a mode, is playing it, or has finished it. */
const getModeStatus = (game: WordHuntGame | null, today: string): WordHuntModeStatus => {
  if (!game || game.board.date !== today) return "not_started";
  return isGameActive(game) ? "in_progress" : "finished";
};

/**
 * Loads the visitor and their Word Hunt data for `mode`, which lives on the visitor data object under the
 * per-world key `${urlSlug}-${sceneDropId}` (initialized by getVisitor). Also returns each mode's status for today.
 * Lifetime `stats` are classic only (golden games don't count toward stats or badges).
 */
export const getWordHuntVisitor = async (
  credentials: Credentials,
  options: { includeInventory?: boolean; shouldGetVisitorDetails?: boolean; mode?: WordHuntMode } = {},
) => {
  try {
    // shouldGetVisitorDetails loads the visitor's details (including isAdmin) with Visitor.get.
    const { includeInventory = false, shouldGetVisitorDetails = false, mode = "classic" } = options;
    const { visitor, visitorInventory } = await getVisitor(credentials, shouldGetVisitorDetails, { includeInventory });
    const key = getDataKey(credentials);

    let dataObject = visitor.dataObject as { [key: string]: WorldScopedData } | undefined;
    // getVisitor may have just initialized the per-world key, in which case our cached copy is stale.
    if (!dataObject?.[key]) dataObject = (await visitor.fetchDataObject()) as { [key: string]: WorldScopedData };

    const wordhunt = dataObject?.[key]?.wordhunt;
    const modeData = (forMode: WordHuntMode): WordHuntVisitorData | undefined =>
      forMode === "classic" ? wordhunt : wordhunt?.[forMode];
    const loadGame = (forMode: WordHuntMode) => {
      const stored = modeData(forMode)?.game;
      return stored ? fromStoredGame(stored) : null;
    };

    const today = getBoardDate();
    const games = Object.fromEntries(WORD_HUNT_MODES.map((forMode) => [forMode, loadGame(forMode)])) as Record<
      WordHuntMode,
      WordHuntGame | null
    >;
    const modes = Object.fromEntries(
      WORD_HUNT_MODES.map((forMode) => [forMode, getModeStatus(games[forMode], today)]),
    ) as Record<WordHuntMode, WordHuntModeStatus>;

    const game = games[mode];
    const stats = wordhunt?.stats as WordHuntStats | undefined;
    const replayDate = modeData(mode)?.replayDate;
    cacheGame(credentials, mode, game);

    return { visitor, game, stats, replayDate, modes, visitorInventory };
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
  analytics,
}: {
  credentials: Credentials;
  visitor: VisitorInterface;
  game: WordHuntGame;
  stats?: WordHuntStats;
  /** Topia analytics events to record with this save (no extra request). */
  analytics?: AnalyticType[];
}) => {
  try {
    // Dot-path keys so only this mode's game (and the classic stats) are replaced, leaving other fields untouched.
    const mode = getGameMode(game);
    await visitor.updateDataObject(
      {
        [getGamePath(credentials, mode)]: toStoredGame(game),
        ...(stats && { [`${getModePath(credentials, "classic")}.stats`]: stats }),
      },
      analytics?.length ? { analytics } : {},
    );
    cacheGame(credentials, mode, game);
  } catch (error) {
    throw standardizeError(error);
  }
};

/**
 * Saves one newly found word. Only that word's entry is written (plus the golden streak in golden mode), so words
 * submitted at the same time can't overwrite each other. The word is added to `game` before saving (so a duplicate
 * submitted meanwhile is rejected) and removed again if the save fails.
 */
export const addFoundWord = async ({
  credentials,
  visitor,
  game,
  word,
  points,
  goldenStreak,
}: {
  credentials: Credentials;
  visitor: VisitorInterface;
  game: WordHuntGame;
  word: string;
  points: number;
  /** Golden mode: the streak after this word. */
  goldenStreak?: number;
}) => {
  const previousStreak = game.goldenStreak;
  const previousBestStreak = game.goldenBestStreak;
  game.foundWords.push({ word, points });
  game.score += points;
  if (goldenStreak !== undefined) {
    game.goldenStreak = goldenStreak;
    game.goldenBestStreak = Math.max(game.goldenBestStreak ?? 0, goldenStreak);
  }
  try {
    const gamePath = getGamePath(credentials, getGameMode(game));
    await visitor.updateDataObject(
      {
        [`${gamePath}.found.${word}`]: points,
        ...(goldenStreak !== undefined && {
          [`${gamePath}.goldenStreak`]: goldenStreak,
          [`${gamePath}.goldenBestStreak`]: game.goldenBestStreak,
        }),
      },
      {},
    );
  } catch (error) {
    game.foundWords = game.foundWords.filter((found) => found.word !== word);
    game.score -= points;
    game.goldenStreak = previousStreak;
    game.goldenBestStreak = previousBestStreak;
    throw standardizeError(error);
  }
};

/**
 * Admin tool: deletes the player's games for `boardDate` in every mode so they can play them again (for testing).
 * Lifetime stats and badges are kept. Their later games on that day are marked as replays and left out of analytics.
 */
export const resetGame = async (credentials: Credentials, boardDate: string) => {
  try {
    const updates = Object.fromEntries(
      WORD_HUNT_MODES.flatMap((mode) => [
        [getGamePath(credentials, mode), null],
        [`${getModePath(credentials, mode)}.replayDate`, boardDate],
      ]),
    );
    await getVisitorForSave(credentials).updateDataObject(updates, {});
    for (const mode of WORD_HUNT_MODES) cacheGame(credentials, mode, null);
  } catch (error) {
    throw standardizeError(error);
  }
};

export const createGame = (
  board: WordHuntBoard,
  now = Date.now(),
  isReplay = false,
  mode: WordHuntMode = "classic",
): WordHuntGame => ({
  ...(isReplay && { isReplay }),
  ...(mode !== "classic" && { mode, goldenStreak: 0 }),
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
  isGameActive(game) && game.board.date === today ? getDailyWordPoints(today, getGameMode(game)) : undefined;

/**
 * Saves a game that has just ended along with the player's updated lifetime stats, then grants any badges
 * those stats unlocked. Returns the names of the newly earned badges. Badge problems never fail the request.
 * Golden games only update the golden bests, so they can earn the golden badges but nothing else.
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
  // Golden games only update the golden bests (for the golden badges), never the classic stats.
  const nextStats = getGameMode(game) === "golden" ? recordFinishedGoldenGame(stats, game) : recordFinishedGame(stats, game);
  const newBadges = getNewBadgeNames(stats, nextStats);
  const analytics = getGameFinishedAnalytics(credentials, game, newBadges);
  await saveGame({ credentials, visitor, game, stats: nextStats, analytics });
  // Recorded in the background; never fails or slows down the request.
  void recordGameFinished(credentials, game);
  await grantBadges({ credentials, visitor, names: newBadges });
  return newBadges;
};
