import { Request, Response } from "express";
import { errorHandler, getCredentials, getVisitor } from "@utils/index.js";
import { pickDailyWord, getTodayDateString } from "@utils/wordquest/pickDailyWord.js";
import { WordleVisitorData } from "@shared/types/WordQuestTypes.js";

// DEV/TEST ONLY — lets you replay today's puzzle without waiting for the daily reset.
// Remove this route before shipping, or gate it behind isAdmin / NODE_ENV !== "production".
export const handleResetGame = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const { urlSlug, sceneDropId } = credentials;
    const key = `${urlSlug}-${sceneDropId}`;

    const { visitor } = await getVisitor(credentials, true);
    const dataObject = await visitor.fetchDataObject();

    const today = getTodayDateString();
    const wordleData: WordleVisitorData = {
      date: today,
      targetWord: pickDailyWord(today + Date.now()), // vary the seed so you don't get the same word every reset
      guesses: [],
      status: "playing",
    };

    await visitor.setDataObject({ ...dataObject, [key]: wordleData });

    return res.json({ success: true, data: { guesses: [], status: "playing", maxGuesses: 6, wordLength: 5 } });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleResetGame",
      message: "Error resetting Wordle game state",
      req,
      res,
    });
  }
};