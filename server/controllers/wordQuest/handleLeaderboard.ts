import { Request, Response } from "express";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getLeaderboard } from "@utils/wordquest/leaderboard.js";

export const handleGetLeaderboard = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const rows = await getLeaderboard(credentials);
    return res.json({ success: true, data: { rows } });
  } catch (error) {
    return errorHandler({ error, functionName: "handleGetLeaderboard", message: "Error getting leaderboard", req, res });
  }
};