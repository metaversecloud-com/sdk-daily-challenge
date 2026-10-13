/**
 * Word Hunt types shared between client and server.
 */

export interface WordHuntBoard {
  /** Board date (YYYY-MM-DD) in the server's board timezone. */
  date: string;
  /** Number of rows/columns. */
  size: number;
  /** Tiles in row-major order. Each tile is one letter, except "Qu". */
  tiles: string[];
}

export interface WordHuntFoundWord {
  word: string;
  points: number;
}

export type WordHuntEndReason = "timeout" | "quit";

export interface WordHuntGame {
  gameId: string;
  board: WordHuntBoard;
  startedAt: number;
  endsAt: number;
  endedAt: number | null;
  endReason: WordHuntEndReason | null;
  score: number;
  foundWords: WordHuntFoundWord[];
}

export type WordHuntSubmitResult = "valid" | "not_a_word" | "too_short" | "already_found" | "invalid_path" | "game_over";

export interface WordHuntGameStateResponse {
  board: WordHuntBoard;
  /** The player's most recent game (in progress or finished), if any. */
  game: WordHuntGame | null;
  serverTime: number;
}

export interface WordHuntSubmitWordResponse {
  result: WordHuntSubmitResult;
  word: string;
  points: number;
  game: WordHuntGame;
  serverTime: number;
}

/** Shape of the Word Hunt data stored on the visitor data object under `${urlSlug}-${sceneDropId}`. */
export interface WordHuntVisitorData {
  game: WordHuntGame | null;
}
