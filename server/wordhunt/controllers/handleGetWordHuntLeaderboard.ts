import { Request, Response } from "express";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getDailyLeaderboard } from "../utils/leaderboard.js";

export const handleGetWordHuntLeaderboard = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const data = await getDailyLeaderboard(credentials);
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
