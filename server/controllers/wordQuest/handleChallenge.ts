import { Request, Response } from "express";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getWordQuestVisitorData } from "./getWordQuestVisitorData.js";
import { evaluateGuess } from "@utils/wordquest/evaluateGuess.js";
import { WORD_BANK_SET, WORD_LENGTH } from "@utils/wordquest/words.js";
import { getAnswerPool } from "@utils/wordquest/answerPool.js";
import { getTodayDateString } from "@utils/wordquest/pickDailyWord.js";
import { saveChallengeRun } from "@utils/wordquest/saveChallengeRun.js";
import { getChallengeLeaderboard, tryRecordChallengeResult } from "@utils/wordquest/challengeLeaderboard.js";
import {
  CHALLENGE_WORD_COUNT,
  advanceChallenge,
  createChallengeRun,
  finalizeIfExpired,
  getTodaysRun,
  parseChallengeMode,
  pickChallengeWords,
  toChallengeView,
} from "@utils/wordquest/challenge.js";

export const handleStartChallenge = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const mode = parseChallengeMode(req.body.mode);
    if (!mode) return res.status(400).json({ success: false, error: "Unknown mode." });

    const { visitor, wordQuestData, isAdmin } = await getWordQuestVisitorData(credentials);
    const today = getTodayDateString();

    // One attempt per mode per day: starting again just returns the existing run
    const existing = getTodaysRun(wordQuestData, mode, today);
    if (existing) {
      if (finalizeIfExpired(existing)) {
        await saveChallengeRun(visitor, credentials, wordQuestData, mode, existing);
        await tryRecordChallengeResult(credentials, existing);
      }
      return res.json({ success: true, data: { ...toChallengeView(mode, existing), isAdmin } });
    }

    const pool = await getAnswerPool(credentials);
    const words = pickChallengeWords(today, credentials.profileId, pool);
    if (words.length < CHALLENGE_WORD_COUNT) {
      return res
        .status(400)
        .json({ success: false, error: `The answer list needs at least ${CHALLENGE_WORD_COUNT} words.` });
    }

    const run = createChallengeRun(mode, today, words);
    await saveChallengeRun(visitor, credentials, wordQuestData, mode, run);

    return res.json({ success: true, data: { ...toChallengeView(mode, run), isAdmin } });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleStartChallenge",
      message: "Error starting WordQuest challenge",
      req,
      res,
    });
  }
};

export const handleGetChallengeLeaderboard = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const mode = parseChallengeMode(req.query.mode);
    if (!mode) return res.status(400).json({ success: false, error: "Unknown mode." });

    const data = await getChallengeLeaderboard(credentials, mode);
    return res.json({ success: true, data });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleGetChallengeLeaderboard",
      message: "Error getting challenge leaderboard",
      req,
      res,
    });
  }
};

export const handleSubmitChallengeGuess = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const mode = parseChallengeMode(req.body.mode);
    if (!mode) return res.status(400).json({ success: false, error: "Unknown mode." });

    const guess: string = (req.body.guess || "").toUpperCase();

    const { visitor, wordQuestData, isAdmin } = await getWordQuestVisitorData(credentials);
    const run = getTodaysRun(wordQuestData, mode, getTodayDateString());
    if (!run) return res.status(400).json({ success: false, error: "Start this mode first." });

    // The clock is checked before anything else, so a late guess never counts
    if (finalizeIfExpired(run)) {
      await saveChallengeRun(visitor, credentials, wordQuestData, mode, run);
      await tryRecordChallengeResult(credentials, run);
      return res.json({ success: true, data: { ...toChallengeView(mode, run), isAdmin } });
    }

    if (run.status !== "playing") {
      return res.status(400).json({ success: false, error: "This run is already over." });
    }
    if (guess.length !== WORD_LENGTH) {
      return res.status(400).json({ success: false, error: `Guess must be ${WORD_LENGTH} letters.` });
    }
    if (!WORD_BANK_SET.has(guess)) {
      return res.status(400).json({ success: false, error: "Not a valid word." });
    }

    const target = run.words[run.wordIndex];
    run.guesses[run.wordIndex].push({ guess, feedback: evaluateGuess(guess, target) });
    advanceChallenge(run, guess === target);

    await saveChallengeRun(visitor, credentials, wordQuestData, mode, run);

    // Record the result once, when the run has just ended
    if (run.status !== "playing") await tryRecordChallengeResult(credentials, run);

    return res.json({ success: true, data: { ...toChallengeView(mode, run), isAdmin } });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleSubmitChallengeGuess",
      message: "Error submitting challenge guess",
      req,
      res,
    });
  }
};