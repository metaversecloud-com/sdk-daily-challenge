import type { ChallengeGameState } from "@shared/types/WordQuestTypes";

export const getResultHeading = (state: ChallengeGameState | null) => {
  if (!state) return "";
  if (state.status === "timeout") return "Time's up";
  if (state.status === "failed") return "Run over";
  return state.score?.wordsSolved === state.wordCount ? "All words solved!" : "Run complete";
};

export const getWordLabel = (state: ChallengeGameState | null, i: number) => {
  if (!state) return "";
  if (state.solved[i]) return "Solved";
  if (i > state.wordIndex) return "Not reached";
  if (i === state.wordIndex && state.status === "timeout") return "Out of time";
  return "Missed";
};