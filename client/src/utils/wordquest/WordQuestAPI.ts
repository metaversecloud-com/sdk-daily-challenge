import { backendAPI } from "../backendAPI";
import { WordQuestGameState } from "@shared/types/WordQuestTypes";

export const fetchGameState = async (): Promise<WordQuestGameState> => {
  const response = await backendAPI.get("/wordquest/game-state");
  return response.data.data;
};

export const submitGuess = async (guess: string): Promise<WordQuestGameState> => {
  const response = await backendAPI.post("/wordquest/guess", { guess });
  return response.data.data;
};