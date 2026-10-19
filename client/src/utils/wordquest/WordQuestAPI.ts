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

// Turns a failed request into text that's safe to render. Validation errors come back as
// `{ error: "message" }`, but server errors come back as `{ error: <object>, message: "..." }`.
export const getWordQuestErrorMessage = (err: any, fallback: string): string => {
  const data = err?.response?.data;
  if (typeof data?.error === "string") return data.error;
  if (typeof data?.message === "string") return data.message;
  return fallback;
};
