import { WordHuntGameStateResponse } from "@shared/types/wordhunt/WordHuntTypes.js";
import { getCredentials } from "@utils/index.js";
import { getDailyBoard } from "./board.js";
import { finalizeIfExpired, finishGame, getWordHuntVisitor } from "./gameState.js";
import { tryRecordDailyScore } from "./leaderboard.js";

export const getWordHuntGameState = async (
  credentials: ReturnType<typeof getCredentials>,
): Promise<WordHuntGameStateResponse> => {
  const board = getDailyBoard();

  const { visitor, game, stats } = await getWordHuntVisitor(credentials);
  if (finalizeIfExpired(game)) {
    await finishGame({ credentials, visitor, game: game!, stats });
    await tryRecordDailyScore({ credentials, game: game! });
  }

  return { board, game, serverTime: Date.now() };
};