import { Request, Response } from "express";
import { errorHandler, getCredentials, getVisitor } from "@utils/index.js";
import { pickDailyWord, getTodayDateString } from "@utils/wordquest/pickDailyWord.js";
import { createDefaultStats } from "@utils/wordquest/stats.js";
import { MAX_GUESSES, WORD_LENGTH } from "@utils/wordquest/words.js";
import { WordQuestVisitorData, WordQuestGameState } from "@shared/types/WordQuestTypes.js";

// DEV/TEST ONLY: remove this route before shipping.
export const handleResetGame = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const { urlSlug, sceneDropId } = credentials;
    const key = `${urlSlug}-${sceneDropId}`;

    const { visitor } = await getVisitor(credentials, true);
    const dataObject = await visitor.fetchDataObject();
    const existing: WordQuestVisitorData | undefined = dataObject?.[key];

    const today = getTodayDateString();
    const wordQuestData: WordQuestVisitorData = {
      date: today,
      targetWord: pickDailyWord(today + Date.now()),
      guesses: [],
      status: "playing",
      stats: existing?.stats ?? createDefaultStats(),
    };

    await visitor.setDataObject({ ...dataObject, [key]: wordQuestData });

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