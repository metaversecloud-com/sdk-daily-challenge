import { getVisitor } from "@utils/index.js";
import { Credentials } from "../../types/Credentials"; // adjust to actual path in repo
import { WordQuestVisitorData } from "@shared/types/WordQuestTypes.js";
import { pickDailyWord, getTodayDateString } from "@utils/wordquest/pickDailyWord.js";
import { createDefaultStats, getYesterdayDateString } from "@utils/wordquest/stats.js";

const buildKey = (urlSlug: string, sceneDropId: string) => `${urlSlug}-${sceneDropId}`;

export const getWordQuestVisitorData = async (credentials: Credentials) => {
  const { urlSlug, sceneDropId } = credentials;
  const key = buildKey(urlSlug, sceneDropId);

  const { visitor } = await getVisitor(credentials, true);

  const dataObject = await visitor.fetchDataObject();
  const today = getTodayDateString();
  const existing: WordQuestVisitorData | undefined = dataObject?.[key];

  let wordQuestData: WordQuestVisitorData;

  if (!existing || existing.date !== today) {
    // Copy so we never mutate the stored object
    const stats = {
      ...(existing?.stats ?? createDefaultStats()),
      guessDistribution: [...(existing?.stats?.guessDistribution ?? createDefaultStats().guessDistribution)],
    };

    // If they skipped a day, the streak is broken.
    if (stats.lastWonDate !== getYesterdayDateString()) stats.currentStreak = 0;

    wordQuestData = {
      date: today,
      targetWord: pickDailyWord(today),
      guesses: [],
      status: "playing",
      stats,
    };
    await visitor.setDataObject({ ...dataObject, [key]: wordQuestData});
  } else {
    // Handles data saved before stats existed
    wordQuestData = { ...existing, stats: existing.stats ?? createDefaultStats() };
  }

  return { visitor, key, wordQuestData };
};