import { getCredentials } from "@utils/index.js";
import { getWordQuestVisitorData } from "../../controllers/wordQuest/getWordQuestVisitorData.js";
import { MAX_GUESSES, WORD_LENGTH } from "./words.js";

export const getWordQuestGameState = async (credentials: ReturnType<typeof getCredentials>) => {
  const { wordQuestData } = await getWordQuestVisitorData(credentials);

  return {
    guesses: wordQuestData.guesses,
    status: wordQuestData.status,
    maxGuesses: MAX_GUESSES,
    wordLength: WORD_LENGTH,
    stats: wordQuestData.stats,
    // Only reveal the answer once the game is over
    ...(wordQuestData.status !== "playing" && { targetWord: wordQuestData.targetWord }),
  };
};