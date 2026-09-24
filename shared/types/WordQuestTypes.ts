export type LetterState = "correct" | "present" | "absent" | "unused";

export interface GuessResult {
  guess: string;
  feedback: LetterState[];
}

export interface WordleGameState {
  guesses: GuessResult[];
  status: "playing" | "won" | "lost";
  maxGuesses: number;
  wordLength: number;
}

// Server-only shape — never sent to client as-is
export interface WordleVisitorData {
  date: string; // "YYYY-MM-DD"
  targetWord: string;
  guesses: GuessResult[];
  status: "playing" | "won" | "lost";
}