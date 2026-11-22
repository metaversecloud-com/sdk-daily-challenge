import { Request, Response } from "express";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getDailyLeaderboard } from "../utils/leaderboard.js";
import { parseMode, UNKNOWN_MODE_ERROR } from "../utils/mode.js";

export const handleGetWordHuntLeaderboard = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const mode = parseMode(req.query.mode);
    if (!mode) return res.status(400).json(UNKNOWN_MODE_ERROR);
    const data = await getDailyLeaderboard(credentials, mode);
    return res.json({ success: true, data });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleGetWordHuntLeaderboard",
      message: "Error getting Word Hunt leaderboard",
      req,
      res,
    });
  }
};
