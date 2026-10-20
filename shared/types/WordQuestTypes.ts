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
  isAdmin?: boolean;
}

// Server-only: what's saved on the visitor's data object
export interface WordQuestVisitorData {
  date: string; // "YYYY-MM-DD"
  targetWord: string;
  guesses: GuessResult[];
  status: "playing" | "won" | "lost";
  stats: WordQuestStatsData;
}


// One row of the WordQuest leaderboard (built by server/utils/wordquest/leaderboard.ts)
export interface LeaderboardRow {
  displayName: string;
  wordsCorrect: number;
  totalGuesses: number;
  averageGuesses: number | null; // null until the player has solved a word
}

