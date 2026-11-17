import { Request, Response } from "express";
import { WordHuntGameStateResponse } from "@shared/types/wordhunt/WordHuntTypes.js";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getDailyBoard } from "../utils/board.js";
import { resetGame } from "../utils/gameState.js";
import { clearDailyLeaderboard, getDailyLeaderboard } from "../utils/leaderboard.js";
import { requireAdmin } from "../utils/requireAdmin.js";


/** Admin tool: removes every score from today's leaderboard. */
export const handleClearWordHuntLeaderboard = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    if (!(await requireAdmin(credentials, res))) return;

    await clearDailyLeaderboard(credentials);
    return res.json({ success: true, data: await getDailyLeaderboard(credentials) });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleClearWordHuntLeaderboard",
      message: "Error clearing the Word Hunt leaderboard",
      req,
      res,
    });
  }
};

/** Admin tool: deletes the admin's own game for today so they can play (and test) the board again. */
export const handleResetWordHuntPlay = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    if (!(await requireAdmin(credentials, res))) return;

    const board = getDailyBoard();
    await resetGame(credentials, board.date);
    // Both modes' games for today were deleted.
    const data: WordHuntGameStateResponse = {
      board,
      game: null,
      serverTime: Date.now(),
      isAdmin: true,
      mode: "classic",
      modes: { classic: "not_started", golden: "not_started" },
    };
    return res.json({ success: true, data });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleResetWordHuntPlay",
      message: "Error resetting the Word Hunt game",
      req,
      res,
    });
  }
};
