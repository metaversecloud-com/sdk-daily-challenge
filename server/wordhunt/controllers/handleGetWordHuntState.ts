import { Request, Response } from "express";
import { WordHuntGameStateResponse } from "@shared/types/wordhunt/WordHuntTypes.js";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getDailyBoard } from "../utils/board.js";
import { finalizeIfExpired, finishGame, getWordHuntVisitor } from "../utils/gameState.js";
import { tryRecordDailyScore } from "../utils/leaderboard.js";

export const handleGetWordHuntState = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const board = getDailyBoard();

    const { visitor, game, stats } = await getWordHuntVisitor(credentials);
    if (finalizeIfExpired(game)) {
      await finishGame({ credentials, visitor, game: game!, stats });
      await tryRecordDailyScore({ credentials, game: game! });
    }

    const data: WordHuntGameStateResponse = { board, game, serverTime: Date.now() };
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
