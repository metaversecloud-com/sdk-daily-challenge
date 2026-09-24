import { Request, Response } from "express";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getWordleVisitorData } from "./getWordQuestVisitorData.js";
import { WordleGameState } from "@shared/types/WordQuestTypes.js";
import { MAX_GUESSES, WORD_LENGTH } from "@utils/wordquest/words.js";

export const handleGetGameState = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const { wordleData } = await getWordleVisitorData(credentials);

    const data: WordleGameState = {
      guesses: wordleData.guesses,
      status: wordleData.status,
      maxGuesses: MAX_GUESSES,
      wordLength: WORD_LENGTH,
    };

    return res.json({ success: true, data });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleGetGameState",
      message: "Error getting Wordle game state",
      req,
      res,
    });
  }
};