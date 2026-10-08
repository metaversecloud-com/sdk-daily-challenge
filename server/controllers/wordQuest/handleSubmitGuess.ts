import { Request, Response } from "express";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getWordQuestVisitorData } from "./getWordQuestVisitorData.js";
import { evaluateGuess } from "@utils/wordquest/evaluateGuess.js";
import { WORD_LIST, WORD_LENGTH, MAX_GUESSES } from "@utils/wordquest/words.js";
import { WordQuestGameState } from "@shared/types/WordQuestTypes.js";
import { recordGameResult } from "@utils/wordquest/stats.js";

export const handleSubmitGuess = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const guess: string = (req.body.guess || "").toUpperCase();

    const { visitor, key, wordQuestData } = await getWordQuestVisitorData(credentials);

    if (wordQuestData.status !== "playing") {
      return res.status(400).json({ success: false, error: "Today's puzzle is already complete." });
    }
    if (guess.length !== WORD_LENGTH) {
      return res.status(400).json({ success: false, error: `Guess must be ${WORD_LENGTH} letters.` });
    }
    if (!WORD_LIST.includes(guess)) {
      return res.status(400).json({ success: false, error: "Not a valid word." });
    }
  
    const feedback = evaluateGuess(guess, wordQuestData.targetWord);
    const guesses = [...wordQuestData.guesses, { guess, feedback }];

    // 1. Decide the outcome FIRST
    let status: WordQuestGameState["status"] = "playing";
    if (guess === wordQuestData.targetWord) status = "won";
    else if (guesses.length >= MAX_GUESSES) status = "lost";

    // 2. Then record stats, only when the game has ended
    const stats =
      status === "playing"
        ? wordQuestData.stats
        : recordGameResult(wordQuestData.stats, status === "won", guesses.length, wordQuestData.date);

    // 3. Save (targetWord stays stored internally)
    await visitor.updateDataObject({ [key]: { ...wordQuestData, guesses, status, stats } });

    // 4. Respond (only reveal targetWord once the game is over)
    const data: WordQuestGameState = {
      guesses,
      status,
      maxGuesses: MAX_GUESSES,
      wordLength: WORD_LENGTH,
      stats,
      ...(status !== "playing" && { targetWord: wordQuestData.targetWord }),
    };

    return res.json({ success: true, data });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleSubmitGuess",
      message: "Error submitting WordQuest guess",
      req,
      res,
    });
  }
};