import { Request } from "express";
import { getCredentials } from "@utils/index.js";
import { getWordQuestVisitorData } from "../controllers/getWordQuestVisitorData.js";
import { MAX_GUESSES, WORD_LENGTH } from "./words.js";
import { getTodayDateString } from "./pickDailyWord.js";
import { finalizeIfExpired, getTodaysRun, parseChallengeMode, toChallengeView } from "./challenge/challenge.js";
import { saveChallengeRun } from "./challenge/saveChallengeRun.js";
import { tryRecordChallengeResult } from "./challenge/challengeLeaderboard.js";
import { getBadgeData } from "./badges/getBadgeData.js";

export const getWordQuestGameState = async (
  credentials: ReturnType<typeof getCredentials>,
  query: Request["query"] = {},
) => {
  const { visitor, wordQuestData, isAdmin } = await getWordQuestVisitorData(credentials);
  const badgeData = await getBadgeData(credentials, visitor, query.forceRefreshInventory === "true");

  // timed or oneshot returns that challenge's state instead of the daily game
  const mode = parseChallengeMode(query.mode);
  if (mode) {
    const run = getTodaysRun(wordQuestData, mode, getTodayDateString());
    if (run && finalizeIfExpired(run)) {
      await saveChallengeRun(visitor, credentials, wordQuestData, mode, run);
    }
    return { ...toChallengeView(mode, run), isAdmin };
  }

  return {
    guesses: wordQuestData.guesses,
    status: wordQuestData.status,
    maxGuesses: MAX_GUESSES,
    wordLength: WORD_LENGTH,
    stats: wordQuestData.stats,
    isAdmin,
      ...badgeData,
    // Only reveal the answer once the game is over
    ...(wordQuestData.status !== "playing" && { targetWord: wordQuestData.targetWord }),
  };
};