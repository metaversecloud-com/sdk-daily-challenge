import { Request, Response } from "express";
import { WordHuntGameStateResponse } from "@shared/types/wordhunt/WordHuntTypes.js";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getDailyBoard } from "../utils/board.js";
import { getWordHuntVisitor, saveGame } from "../utils/gameState.js";

// Ending within this window of the timer running out counts as a timeout rather than quitting early.
const TIMEOUT_TOLERANCE_MS = 2000;

export const handleEndWordHunt = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const { gameId } = req.body || {};

    const { visitor, game } = await getWordHuntVisitor(credentials);
    if (!game || game.gameId !== gameId) {
      return res.status(400).json({ success: false, error: "No Word Hunt game in progress" });
    }

    if (!game.endedAt) {
      const now = Date.now();
      game.endedAt = Math.min(now, game.endsAt);
      game.endReason = now >= game.endsAt - TIMEOUT_TOLERANCE_MS ? "timeout" : "quit";
      await saveGame({ credentials, visitor, game });
    }

    const data: WordHuntGameStateResponse = { board: getDailyBoard(), game, serverTime: Date.now() };
    return res.json({ success: true, data });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleEndWordHunt",
      message: "Error ending Word Hunt game",
      req,
      res,
    });
  }
};
