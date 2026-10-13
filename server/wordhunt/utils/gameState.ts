import { randomUUID } from "crypto";
import { VisitorInterface } from "@rtsdk/topia";
import { WordHuntBoard, WordHuntGame, WordHuntVisitorData } from "@shared/types/wordhunt/WordHuntTypes.js";
import { getVisitor } from "@utils/getVisitor.js";
import { standardizeError } from "@utils/standardizeError.js";
import { Credentials } from "../../types/index.js";
import { GAME_DURATION_MS, SUBMISSION_GRACE_MS } from "./constants.js";

type WorldScopedData = { [key: string]: any; wordhunt?: WordHuntVisitorData };

const getDataKey = ({ urlSlug, sceneDropId }: Credentials) => `${urlSlug}-${sceneDropId}`;

/**
 * Loads the visitor and their Word Hunt data, which lives on the visitor data object under the
 * per-world key `${urlSlug}-${sceneDropId}` (initialized by getVisitor).
 */
export const getWordHuntVisitor = async (credentials: Credentials) => {
  try {
    const { visitor } = await getVisitor(credentials, false, { includeInventory: false });
    const key = getDataKey(credentials);

    let dataObject = visitor.dataObject as { [key: string]: WorldScopedData } | undefined;
    // getVisitor may have just initialized the per-world key, in which case our cached copy is stale.
    if (!dataObject?.[key]) dataObject = (await visitor.fetchDataObject()) as { [key: string]: WorldScopedData };

    const game = dataObject?.[key]?.wordhunt?.game || null;

    return { visitor, game };
  } catch (error) {
    throw standardizeError(error);
  }
};

export const saveGame = async ({
  credentials,
  visitor,
  game,
}: {
  credentials: Credentials;
  visitor: VisitorInterface;
  game: WordHuntGame;
}) => {
  try {
    // Dot-path key so only the Word Hunt game is replaced, leaving other per-world fields untouched.
    await visitor.updateDataObject({ [`${getDataKey(credentials)}.wordhunt.game`]: game }, {});
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
