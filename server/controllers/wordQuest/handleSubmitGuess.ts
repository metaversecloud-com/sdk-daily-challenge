import { Request, Response } from "express";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getWordleVisitorData } from "./getWordQuestVisitorData.js";
import { evaluateGuess } from "@utils/wordquest/evaluateGuess.js";
import { WORD_LIST, WORD_LENGTH, MAX_GUESSES } from "@utils/wordquest/words.js";
import { WordleGameState } from "@shared/types/WordQuestTypes.js";

export const handleSubmitGuess = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const guess: string = (req.body.guess || "").toUpperCase();

    const { visitor, key, wordleData } = await getWordleVisitorData(credentials);

    if (wordleData.status !== "playing") {
      return res.status(400).json({ success: false, error: "Today's puzzle is already complete." });
    }
    if (guess.length !== WORD_LENGTH) {
      return res.status(400).json({ success: false, error: `Guess must be ${WORD_LENGTH} letters.` });
    }
    if (!WORD_LIST.includes(guess)) {
      return res.status(400).json({ success: false, error: "Not a valid word." });
    }

    const feedback = evaluateGuess(guess, wordleData.targetWord);
    const guesses = [...wordleData.guesses, { guess, feedback }];

    let status: WordleGameState["status"] = "playing";
    if (guess === wordleData.targetWord) status = "won";
    else if (guesses.length >= MAX_GUESSES) status = "lost";

    await visitor.updateDataObject({ [key]: { ...wordleData, guesses, status } });

    const data: WordleGameState = { guesses, status, maxGuesses: MAX_GUESSES, wordLength: WORD_LENGTH };
    return res.json({ success: true, data });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleSubmitGuess",
      message: "Error submitting Wordle guess",
      req,
      res,
    });
  }
};
