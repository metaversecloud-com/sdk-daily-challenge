import { Request, Response } from "express";
import { WordHuntGameStateResponse } from "@shared/types/wordhunt/WordHuntTypes.js";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getDailyBoard } from "../utils/board.js";
import { finalizeIfExpired, finishGame, getValidWordsForGame, getWordHuntVisitor } from "../utils/gameState.js";
import { tryRecordDailyScore } from "../utils/leaderboard.js";
import { getRevealedWordOfTheDay } from "../utils/wordOfTheDay.js";
import { parseMode, UNKNOWN_MODE_ERROR } from "../utils/mode.js";

export const handleGetWordHuntState = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const mode = parseMode(req.query.mode);
    if (!mode) return res.status(400).json(UNKNOWN_MODE_ERROR);
    const board = getDailyBoard(undefined, mode);

    const { visitor, game, stats, modes } = await getWordHuntVisitor(credentials, { shouldGetVisitorDetails: true, mode });
    if (finalizeIfExpired(game)) {
      await finishGame({ credentials, visitor, game: game!, stats });
      await tryRecordDailyScore({ credentials, game: game! });
    }

    const data: WordHuntGameStateResponse = {
      board,
      game,
      serverTime: Date.now(),
      wordOfTheDay: getRevealedWordOfTheDay(game),
      validWords: getValidWordsForGame(game, board.date),
      isAdmin: !!visitor.isAdmin,
      mode,
      modes,
    };
    return res.json({ success: true, data });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleGetWordHuntState",
      message: "Error getting Word Hunt game state",
      req,
      res,
    });
  }
};
