import { getVisitor } from "@utils/index.js";
import { Credentials } from "../../types/Credentials";
import { WordQuestVisitorData } from "@shared/types/WordQuestTypes.js";
import { getAnswerPool } from "../utils/answerPool.js";
import { pickDailyWord, getTodayDateString } from "../utils/pickDailyWord.js";
import { createDefaultStats, getYesterdayDateString } from "../utils/stats.js";

type KeyParts = Pick<Credentials, "urlSlug" | "sceneDropId">;

export const getWordQuestKey = ({ urlSlug, sceneDropId }: KeyParts) => `${urlSlug}-${sceneDropId}`;
// Dot-path for updateDataObject. Only ever write here, never to the shared key itself.
export const getWordQuestPath = (credentials: KeyParts) => `${getWordQuestKey(credentials)}.wordquest`;
export const CHALLENGE_MODES = ["timed", "suddenDeath"] as const;
export const getChallengeKey = (credentials: KeyParts, mode: (typeof CHALLENGE_MODES)[number]) =>
  `${getWordQuestKey(credentials)}-challenge-${mode}`;

export const getWordQuestVisitorData = async (credentials: Credentials) => {
  const key = getWordQuestKey(credentials);

  const { visitor } = await getVisitor(credentials, true);

  const dataObject = (await visitor.fetchDataObject()) as Record<string, any> | undefined;
  const today = getTodayDateString();
  const existing: WordQuestVisitorData | undefined = dataObject?.[key]?.wordquest;

  let wordQuestData: WordQuestVisitorData;

  if (!existing || existing.date !== today) {
     console.log("NEW-DAY BRANCH", { hadExisting: !!existing, existingDate: existing?.date, today });
    // Copy so we never mutate the stored object
    const stats = {
      ...(existing?.stats ?? createDefaultStats()),
      guessDistribution: [...(existing?.stats?.guessDistribution ?? createDefaultStats().guessDistribution)],
    };

    // If they skipped a day, the streak is broken.
    if (stats.lastWonDate !== getYesterdayDateString()) stats.currentStreak = 0;

    const pool = await getAnswerPool(credentials);
    wordQuestData = {
      date: today,
      targetWord: pickDailyWord(today, pool),
      guesses: [],
      status: "playing",
      stats,
    };

    // Keep whatever else lives under this key (e.g. Word Hunt)
    await visitor.updateDataObject({ [key]: { ...dataObject?.[key], wordquest: wordQuestData } }, {});
  } else {
    // Handles data saved before stats existed
    wordQuestData = { ...existing, stats: existing.stats ?? createDefaultStats() };
  }

    // Challenge runs live under their own top-level keys, stored as JSON strings
  const challenge: NonNullable<WordQuestVisitorData["challenge"]> = {};
  for (const mode of CHALLENGE_MODES) {
    const raw = dataObject?.[getChallengeKey(credentials, mode)];
    if (typeof raw === "string" && raw) {
      try {
        challenge[mode] = JSON.parse(raw);
      } catch {
        // ignore a corrupt run
      }
    }
  }

  return { visitor, key, wordQuestData: { ...wordQuestData, challenge }, isAdmin: visitor.isAdmin ?? false };
};