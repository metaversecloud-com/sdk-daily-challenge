import { Request, Response } from "express";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getWordQuestVisitorData } from "./getWordQuestVisitorData.js";
import { WordQuestGameState } from "@shared/types/WordQuestTypes.js";
import { MAX_GUESSES, WORD_LENGTH } from "@utils/wordquest/words.js";

export const handleGetGameState = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const { wordQuestData } = await getWordQuestVisitorData(credentials);

    const data: WordQuestGameState = {
      guesses: wordQuestData.guesses,
      status: wordQuestData.status,
      maxGuesses: MAX_GUESSES,
      wordLength: WORD_LENGTH,
      stats: wordQuestData.stats,
      ...(wordQuestData.status !== "playing" && { targetWord: wordQuestData.targetWord }),
    };

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