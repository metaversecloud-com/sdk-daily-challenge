import { Request, Response } from "express";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getWordHuntGameState } from "../utils/getWordHuntGameState.js";

export const handleGetWordHuntState = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const data = await getWordHuntGameState(credentials);
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
