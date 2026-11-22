import { Request } from "express";
import { WordHuntGameStateResponse } from "@shared/types/wordhunt/WordHuntTypes.js";
import { getCredentials } from "@utils/index.js";
import { getDailyBoard } from "./board.js";
import { finalizeIfExpired, finishGame, getValidWordsForGame, getWordHuntVisitor } from "./gameState.js";
import { parseMode } from "./mode.js";
import { getRevealedWordOfTheDay } from "./wordOfTheDay.js";

/**
 * Today's board and the player's game for `?mode=classic|golden` (classic if missing), plus each mode's status.
 * A game whose timer ran out is finished (and scored) here. Used by both GET /game-state?game=wordhunt and
 * GET /wordhunt/game-state.
 */
export const getWordHuntGameState = async (
  credentials: ReturnType<typeof getCredentials>,
  query: Request["query"] = {},
): Promise<WordHuntGameStateResponse> => {
  const mode = parseMode(query.mode);
  if (!mode) throw { status: 400, message: "Unknown Word Hunt mode." };
  const board = getDailyBoard(undefined, mode);

  // Loads visitor details so the response can say whether the player is a world admin (shows the admin tools).
  const { visitor, game, stats, modes } = await getWordHuntVisitor(credentials, { shouldGetVisitorDetails: true, mode });
  // finishGame also records the score on today's leaderboard.
  if (finalizeIfExpired(game)) await finishGame({ credentials, visitor, game: game!, stats });

  return {
    board,
    game,
    serverTime: Date.now(),
    wordOfTheDay: getRevealedWordOfTheDay(game),
    validWords: getValidWordsForGame(game, board.date),
    isAdmin: !!visitor.isAdmin,
    mode,
    modes,
  };
};
