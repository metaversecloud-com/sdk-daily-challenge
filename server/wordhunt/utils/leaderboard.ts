import {
  WordHuntGame,
  WordHuntLeaderboardEntry,
  WordHuntLeaderboardResponse,
} from "@shared/types/wordhunt/WordHuntTypes.js";
import { errorHandler } from "@utils/errorHandler.js";
import { getDroppedAsset } from "@utils/droppedAssets/getDroppedAsset.js";
import { standardizeError } from "@utils/standardizeError.js";
import { Credentials } from "../../types/index.js";
import { getBoardDate } from "./board.js";
import { LEADERBOARD_SIZE } from "./constants.js";

/**
 * Parses `{ [profileId]: "displayName|score" }` into entries ranked by score (highest first),
 * with ties broken alphabetically by name so the order is stable.
 */
export const parseLeaderboard = (scores?: Record<string, string>): WordHuntLeaderboardEntry[] => {
  if (!scores) return [];

  const entries = Object.entries(scores).map(([profileId, value]) => {
    const [name = "", scoreText = "0"] = (value || "").split("|");
    return { profileId, name, score: parseInt(scoreText, 10) || 0 };
  });

  return entries
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
};

/** Today's leaderboard. Scores stored for an earlier date are ignored. */
export const getDailyLeaderboard = async (credentials: Credentials): Promise<WordHuntLeaderboardResponse> => {
  try {
    const date = getBoardDate();
    const droppedAsset = await getDroppedAsset(credentials);
    const stored = droppedAsset.dataObject?.dailyLeaderboard;

    const ranked = stored?.date === date ? parseLeaderboard(stored.scores) : [];
    const me = ranked.find((entry) => entry.profileId === credentials.profileId) || null;

    return { date, entries: ranked.slice(0, LEADERBOARD_SIZE), me };
  } catch (error) {
    throw standardizeError(error);
  }
};

/**
 * Records a finished game on today's leaderboard, keeping each player's best score of the day.
 * The leaderboard lives on the dropped asset's data object:
 *
 *   dailyLeaderboard: { date: "YYYY-MM-DD", scores: { [profileId]: "displayName|score" } }
 *
 * When the stored date is not today's, the previous day's scores are discarded.
 */
export const recordDailyScore = async ({ credentials, game }: { credentials: Credentials; game: WordHuntGame }) => {
  try {
    const { displayName, profileId } = credentials;
    const date = getBoardDate();
    // Only today's board counts, and an empty game isn't worth a leaderboard spot.
    if (game.board.date !== date || game.score <= 0) return;

    const droppedAsset = await getDroppedAsset(credentials);
    const stored = droppedAsset.dataObject?.dailyLeaderboard;
    // "|" is the field separator in the stored string.
    const entry = `${(displayName || "Player").replace(/\|/g, "")}|${game.score}`;

    if (stored?.date === date) {
      const previousScore = parseInt((stored.scores?.[profileId] || "").split("|")[1], 10) || 0;
      if (previousScore >= game.score) return;
      await droppedAsset.updateDataObject({ [`dailyLeaderboard.scores.${profileId}`]: entry }, {});
    } else {
      await droppedAsset.updateDataObject({ dailyLeaderboard: { date, scores: { [profileId]: entry } } }, {});
    }
  } catch (error) {
    throw standardizeError(error);
  }
};

/** Records a finished game without ever failing the request that ended it. */
export const tryRecordDailyScore = async (args: { credentials: Credentials; game: WordHuntGame }) => {
  try {
    await recordDailyScore(args);
  } catch (error) {
    errorHandler({ error, functionName: "tryRecordDailyScore", message: "Error recording Word Hunt daily score" });
  }
};
