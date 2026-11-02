import { Request, Response } from "express";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getWordQuestGameState } from "../utils/getWordQuestGameState.js";

export const handleGetGameState = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const data = await getWordQuestGameState(credentials, req.query);
    return res.json({ success: true, data });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleGetGameState",
      message: "Error getting WordQuest game state",
      req,
      res,
    });
  }
};