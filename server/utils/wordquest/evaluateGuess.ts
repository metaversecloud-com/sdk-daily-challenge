import { LetterState } from "@shared/types/WordQuestTypes.js";
import { WORD_LENGTH } from "./words.js";

export const evaluateGuess = (guess: string, target: string): LetterState[] => {
  const feedback: LetterState[] = new Array(WORD_LENGTH).fill("absent");
  const targetLetters: (string | null)[] = target.split("");

  // Pass 1: correct position
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === target[i]) {
      feedback[i] = "correct";
      targetLetters[i] = null;
    }
  }

  // Pass 2: correct letter, wrong position
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (feedback[i] === "correct") continue;
    const idx = targetLetters.indexOf(guess[i]);
    if (idx !== -1) {
      feedback[i] = "present";
      targetLetters[idx] = null;
    }
  }

  return feedback;
};