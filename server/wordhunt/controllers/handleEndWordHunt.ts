import { Request, Response } from "express";
import { WordHuntGameStateResponse } from "@shared/types/wordhunt/WordHuntTypes.js";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getDailyBoard } from "../utils/board.js";
import { finishGame, getWordHuntVisitor } from "../utils/gameState.js";
import { getRevealedWordOfTheDay } from "../utils/wordOfTheDay.js";
import { parseMode, UNKNOWN_MODE_ERROR } from "../utils/mode.js";

// Ending within this window of the timer running out counts as a timeout rather than quitting early.
const TIMEOUT_TOLERANCE_MS = 2000;

export const handleEndWordHunt = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const mode = parseMode(req.query.mode);
    if (!mode) return res.status(400).json(UNKNOWN_MODE_ERROR);
    const { gameId } = req.body || {};

    const { visitor, game, stats, modes } = await getWordHuntVisitor(credentials, { mode });
    if (!game || game.gameId !== gameId) {
      return res.status(400).json({ success: false, error: "No Word Hunt game in progress" });
    }

    let newBadges: string[] = [];
    if (!game.endedAt) {
      const now = Date.now();
      game.endedAt = Math.min(now, game.endsAt);
      game.endReason = now >= game.endsAt - TIMEOUT_TOLERANCE_MS ? "timeout" : "quit";
      newBadges = await finishGame({ credentials, visitor, game, stats });
    }

    const data: WordHuntGameStateResponse = {
      board: getDailyBoard(undefined, mode),
      game,
      serverTime: Date.now(),
      newBadges,
      wordOfTheDay: getRevealedWordOfTheDay(game),
      mode,
      modes: { ...modes, [mode]: "finished" },
    };
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
