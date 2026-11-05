import { WordHuntGameStateResponse } from "@shared/types/wordhunt/WordHuntTypes.js";
import { getCredentials } from "@utils/index.js";
import { getDailyBoard } from "./board.js";
import { finalizeIfExpired, finishGame, getWordHuntVisitor } from "./gameState.js";
import { getRevealedWordOfTheDay } from "./wordOfTheDay.js";

/** Today's board and the player's game. A game whose timer ran out is finished (and scored) here. */
export const getWordHuntGameState = async (
  credentials: ReturnType<typeof getCredentials>,
): Promise<WordHuntGameStateResponse> => {
  const board = getDailyBoard();

  const { visitor, game, stats } = await getWordHuntVisitor(credentials);
  // finishGame also records the score on today's leaderboard.
  if (finalizeIfExpired(game)) await finishGame({ credentials, visitor, game: game!, stats });

  return { board, game, serverTime: Date.now(), wordOfTheDay: getRevealedWordOfTheDay(game) };
};
