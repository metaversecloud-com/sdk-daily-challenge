import { Request, Response } from "express";
import { WordHuntGameStateResponse } from "@shared/types/wordhunt/WordHuntTypes.js";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getVisitor } from "@utils/getVisitor.js";
import { Credentials } from "../../types/index.js";
import { getDailyBoard } from "../utils/board.js";
import { resetGame } from "../utils/gameState.js";
import { clearDailyLeaderboard, getDailyLeaderboard } from "../utils/leaderboard.js";

/** Responds 403 and returns false unless the player is an admin of this world (checked with Topia, never trusted from the client). */
const requireAdmin = async (credentials: Credentials, res: Response) => {
  const { visitor } = await getVisitor(credentials, true, { includeInventory: false });
  if (visitor.isAdmin) return true;
  res.status(403).json({ success: false, error: "Only world admins can do that." });
  return false;
};

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

    await resetGame(credentials);
    const data: WordHuntGameStateResponse = { board: getDailyBoard(), game: null, serverTime: Date.now(), isAdmin: true };
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
