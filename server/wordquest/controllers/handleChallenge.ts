import { Request, Response } from "express";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getWordQuestVisitorData } from "./getWordQuestVisitorData.js";
import { evaluateGuess } from "../utils/evaluateGuess.js";
import { WORD_BANK_SET, WORD_LENGTH } from "../utils/words.js";
import { getAnswerPool } from "../utils/answerPool.js";
import { getTodayDateString } from "../utils/pickDailyWord.js";
import { saveChallengeRun } from "../utils/challenge/saveChallengeRun.js";
import { getChallengeLeaderboard, tryRecordChallengeResult } from "../utils/challenge/challengeLeaderboard.js";
import type { ChallengeRun } from "@shared/types/WordQuestTypes.js";
import { evaluateChallengeBadges } from "../utils/badges/evaluateBadges.js";
import { awardBadges } from "../utils/badges/awardBadges.js";
import { modeEvents, trackAnalytics } from "../utils/analytics.js";
import {
  CHALLENGE_WORD_COUNT,
  advanceChallenge,
  createChallengeRun,
  finalizeIfExpired,
  getTodaysRun,
  parseChallengeMode,
  pickChallengeWords,
  toChallengeView,
} from "../utils/challenge/challenge.js";

const awardRunBadges = async (credentials: ReturnType<typeof getCredentials>, visitor: any, run: ChallengeRun) => {
  const won = run.solved.length > 0 && run.solved.every(Boolean);
  await trackAnalytics(
    visitor,
    credentials.urlSlug,
    modeEvents(run.mode, won ? ["completions", "wins"] : ["completions", "losses"], credentials.profileId),
  );
  await awardBadges({ credentials, visitor, earned: evaluateChallengeBadges(run) });
};

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
        await awardRunBadges(credentials, visitor, existing);
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
    await trackAnalytics(visitor, credentials.urlSlug, modeEvents(mode, ["starts"], credentials.profileId));

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
      await awardRunBadges(credentials, visitor, run);
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

    // Record the result and award badges once, when the run has just ended
    if (run.status !== "playing") {
      await tryRecordChallengeResult(credentials, run);
      await awardRunBadges(credentials, visitor, run);
    }

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