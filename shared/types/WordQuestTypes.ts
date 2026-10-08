export type LetterState = "correct" | "present" | "absent" | "unused";

export interface GuessResult {
  guess: string;
  feedback: LetterState[];
}

export interface WordQuestStatsData {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  maxStreak: number;
  lastWonDate: string | null;
  guessDistribution: number[]; // index 0 = solved in 1 guess, index 5 = solved in 6
}

// What the client receives
export interface WordQuestGameState {
  guesses: GuessResult[];
  status: "playing" | "won" | "lost";
  maxGuesses: number;
  wordLength: number;
  targetWord?: string; // only present once status !== "playing"
  stats: WordQuestStatsData;
}

// Server-only: what's saved on the visitor's data object
export interface WordQuestVisitorData {
  date: string; // "YYYY-MM-DD"
  targetWord: string;
  guesses: GuessResult[];
  status: "playing" | "won" | "lost";
  stats: WordQuestStatsData;
}