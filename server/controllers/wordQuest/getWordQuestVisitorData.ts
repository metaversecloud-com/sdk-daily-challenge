import { getVisitor } from "@utils/index.js";
import { Credentials } from "../../types/Credentials"; // adjust to actual path in repo
import { WordleVisitorData } from "@shared/types/WordQuestTypes.js";
import { pickDailyWord, getTodayDateString } from "../../utils/wordquest/pickDailyWord";

const buildKey = (urlSlug: string, sceneDropId: string) => `${urlSlug}-${sceneDropId}`;

export const getWordleVisitorData = async (credentials: Credentials) => {
  const { urlSlug, sceneDropId } = credentials;
  const key = buildKey(urlSlug, sceneDropId);

  const { visitor } = await getVisitor(credentials, true);

  const dataObject = await visitor.fetchDataObject();
  const today = getTodayDateString();
  const existing: WordleVisitorData | undefined = dataObject?.[key];

  let wordleData: WordleVisitorData;

  if (!existing || existing.date !== today) {
    wordleData = {
      date: today,
      targetWord: pickDailyWord(today),
      guesses: [],
      status: "playing",
    };
    await visitor.setDataObject({ ...dataObject, [key]: wordleData });
  } else {
    wordleData = existing;
  }

  return { visitor, key, wordleData };
};