import { randomUUID } from "crypto";
import { VisitorInterface } from "@rtsdk/topia";
import { WordHuntBoard, WordHuntGame, WordHuntStats, WordHuntVisitorData } from "@shared/types/wordhunt/WordHuntTypes.js";
import { getVisitor } from "@utils/getVisitor.js";
import { standardizeError } from "@utils/standardizeError.js";
import { Credentials } from "../../types/index.js";
import { getNewBadgeNames, recordFinishedGame } from "./badges.js";
import { grantBadges } from "./grantBadges.js";
import { GAME_DURATION_MS, SUBMISSION_GRACE_MS } from "./constants.js";

type WorldScopedData = { [key: string]: any; wordhunt?: WordHuntVisitorData };

const getDataKey = ({ urlSlug, sceneDropId }: Credentials) => `${urlSlug}-${sceneDropId}`;

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

    const game = dataObject?.[key]?.wordhunt?.game || null;
    const stats = dataObject?.[key]?.wordhunt?.stats as WordHuntStats | undefined;

    return { visitor, game, stats, visitorInventory };
  } catch (error) {
    throw standardizeError(error);
  }
};

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
    await visitor.updateDataObject({ [`${prefix}.game`]: game, ...(stats && { [`${prefix}.stats`]: stats }) }, {});
  } catch (error) {
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
 * Saves a game that has just ended along with the player's updated lifetime stats, then grants any badges
 * those stats unlocked. Returns the names of the newly earned badges. Badge problems never fail the request.
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
  await saveGame({ credentials, visitor, game, stats: nextStats });
  const newBadges = getNewBadgeNames(stats, nextStats);
  await grantBadges({ credentials, visitor, names: newBadges });
  return newBadges;
};
