export const BOARD_SIZE = 5;
export const MIN_WORD_LENGTH = 3;
export const GAME_DURATION_MS = 2 * 60 * 1000;

// Submissions that arrive slightly after the timer ends (network latency) are still accepted.
export const SUBMISSION_GRACE_MS = 3000;

// A daily board is regenerated (deterministically) until it contains at least this many words.
export const MIN_WORDS_PER_BOARD = 150;
export const MAX_BOARD_ATTEMPTS = 50;

// Boards roll over at midnight in this timezone.
export const BOARD_TIMEZONE = process.env.WORDHUNT_TIMEZONE || "America/Los_Angeles";

/**
 * Points by word length (letters, where a "Qu" tile counts as two).
 * Words of 8 or more letters earn the 8-letter score.
 */
export const POINTS_BY_LENGTH: Record<number, number> = {
  3: 200,
  4: 400,
  5: 800,
  6: 1000,
  7: 1200,
  8: 1400,
};

export const getPointsForWord = (word: string) => {
  if (word.length < MIN_WORD_LENGTH) return 0;
  return POINTS_BY_LENGTH[Math.min(word.length, 8)];
};

// Big Boggle (5x5) letter dice. "Qu" is a single tile worth two letters.
export const LETTER_DICE = [
  ["A", "A", "A", "F", "R", "S"],
  ["A", "A", "E", "E", "E", "E"],
  ["A", "A", "F", "I", "R", "S"],
  ["A", "D", "E", "N", "N", "N"],
  ["A", "E", "E", "E", "E", "M"],
  ["A", "E", "E", "G", "M", "U"],
  ["A", "E", "G", "M", "N", "N"],
  ["A", "F", "I", "R", "S", "Y"],
  ["B", "J", "K", "Qu", "X", "Z"],
  ["C", "C", "N", "S", "T", "W"],
  ["C", "E", "I", "I", "L", "T"],
  ["C", "E", "I", "L", "P", "T"],
  ["C", "E", "I", "P", "S", "T"],
  ["D", "D", "L", "N", "O", "R"],
  ["D", "H", "H", "L", "O", "R"],
  ["D", "H", "H", "N", "O", "T"],
  ["D", "H", "L", "N", "O", "R"],
  ["E", "I", "I", "I", "T", "T"],
  ["E", "M", "O", "T", "T", "T"],
  ["E", "N", "S", "S", "S", "U"],
  ["F", "I", "P", "R", "S", "Y"],
  ["G", "O", "R", "R", "V", "W"],
  ["H", "I", "P", "R", "R", "Y"],
  ["N", "O", "O", "T", "U", "W"],
  ["O", "O", "O", "T", "T", "U"],
];
