import { backendAPI } from "../backendAPI";
import { WordleGameState } from "@shared/types/WordQuestTypes";

export const fetchGameState = async (): Promise<WordleGameState> => {
  const response = await backendAPI.get("/game-state");
  return response.data.data;
};

export const submitGuess = async (guess: string): Promise<WordleGameState> => {
  const response = await backendAPI.post("/guess", { guess });
  return response.data.data;
};