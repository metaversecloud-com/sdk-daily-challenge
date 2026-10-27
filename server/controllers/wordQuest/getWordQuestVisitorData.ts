import { getVisitor } from "@utils/index.js";
import { Credentials } from "../../types/index.js";
import { WordQuestVisitorData } from "@shared/types/WordQuestTypes.js";
import { getAnswerPool } from "@utils/wordquest/answerPool.js";
import { pickDailyWord, getTodayDateString } from "@utils/wordquest/pickDailyWord.js";
import { createDefaultStats, getYesterdayDateString } from "@utils/wordquest/stats.js";

// WordQuest data lives under `${urlSlug}-${sceneDropId}.wordquest` on the visitor data object.
// The per-world key is shared with other games (e.g. `.wordhunt`), so only ever write to the `.wordquest` path.
type WordQuestDataObject = { [key: string]: { wordquest?: WordQuestVisitorData } | undefined };

export const getWordQuestKey = ({ urlSlug, sceneDropId }: Credentials) => `${urlSlug}-${sceneDropId}`;
export const getWordQuestPath = (credentials: Credentials) => `${getWordQuestKey(credentials)}.wordquest`;

export const getWordQuestVisitorData = async (credentials: Credentials) => {
  const key = getWordQuestKey(credentials);

  const { visitor } = await getVisitor(credentials, true, { includeInventory: false });

  const dataObject = (await visitor.fetchDataObject()) as WordQuestDataObject | undefined;
  const today = getTodayDateString();
  const existing = dataObject?.[key]?.wordquest;

  let wordQuestData: WordQuestVisitorData;

  if (!existing || existing.date !== today) {
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
    await visitor.updateDataObject({ [getWordQuestPath(credentials)]: wordQuestData }, {});
  } else {
    // Handles data saved before stats existed
    wordQuestData = { ...existing, stats: existing.stats ?? createDefaultStats() };
  }

  return { visitor, key, wordQuestData, isAdmin: visitor.isAdmin ?? false };
};