import { Request, Response } from "express";
import { errorHandler, getCredentials } from "@utils/index.js";
import { pickDailyWord, getTodayDateString } from "@utils/wordquest/pickDailyWord.js";
import { getAnswerPool } from "@utils/wordquest/answerPool.js";
import { MAX_GUESSES, WORD_LENGTH } from "@utils/wordquest/words.js";
import { WordQuestVisitorData, WordQuestGameState } from "@shared/types/WordQuestTypes.js";
import { getWordQuestPath, getWordQuestVisitorData } from "./getWordQuestVisitorData.js";

// DEV/TEST ONLY: remove this route before shipping.
export const handleResetGame = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);

    const { visitor, wordQuestData: existing } = await getWordQuestVisitorData(credentials);

    const today = getTodayDateString();
    const wordQuestData: WordQuestVisitorData = {
      date: today,
      targetWord: pickDailyWord(today + Date.now(), await getAnswerPool(credentials)),
      guesses: [],
      status: "playing",
      stats: existing.stats,
    };

    await visitor.updateDataObject({ [getWordQuestPath(credentials)]: wordQuestData }, {});

    const data: WordQuestGameState = {
      guesses: [],
      status: "playing",
      maxGuesses: MAX_GUESSES,
      wordLength: WORD_LENGTH,
      stats: wordQuestData.stats,
    };

    return res.json({ success: true, data });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleResetGame",
      message: "Error resetting WordQuest game state",
      req,
      res,
    });
  }
};
