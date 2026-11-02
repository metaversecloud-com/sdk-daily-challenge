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
  challenge?: Partial<Record<ChallengeMode, ChallengeRun>>; // today's timed / sudden death runs
}


// One row of the WordQuest leaderboard (built by server/utils/wordquest/leaderboard.ts)
export interface LeaderboardRow {
  displayName: string;
  wordsCorrect: number;
  totalGuesses: number; // guesses used across solved words
  averageGuesses: number | null; // null until the player has solved a word
}

// challenge
export type ChallengeMode = "timed" | "suddenDeath";
export type ChallengeStatus = "playing" | "complete" | "failed" | "timeout";

export interface ChallengeRun {
  mode: ChallengeMode;
  date: string;
  words: string[];
  wordIndex: number;
  guesses: GuessResult[][];
  solved: boolean[];
  status: ChallengeStatus;
  startedAt: number;
  endsAt: number | null;
  finishedAt: number | null;
}

export interface ChallengeGameState {
  mode: ChallengeMode;
  status: ChallengeStatus | "notStarted";
  wordIndex: number;
  wordCount: number;
  guesses: GuessResult[]; // current word only
  solved: boolean[];
  maxGuesses: number;
  wordLength: number;
  endsAt: number | null;
  serverTime: number;
  words?: string[]; // only once the run is over
  score?: { wordsSolved: number; totalGuesses: number; timeLeftMs: number | null };
  isAdmin?: boolean;
}

export interface ChallengeLeaderboardRow {
  displayName: string;
  wordsSolved: number;
  totalGuesses: number;
  timeLeftMs: number | null; // timed mode only
  runs: number;
}