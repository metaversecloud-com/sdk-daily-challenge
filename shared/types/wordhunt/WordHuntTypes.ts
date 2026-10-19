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

export type WordHuntSubmitResult =
  | "valid"
  | "not_a_word"
  | "too_short"
  | "already_found"
  | "invalid_path"
  | "game_over";

export interface WordHuntGameStateResponse {
  board: WordHuntBoard;
  /** The player's most recent game (in progress or finished), if any. */
  game: WordHuntGame | null;
  serverTime: number;
  /** Names of badges the player earned by finishing this game (only set when a game was just finished). */
  newBadges?: string[];
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
  stats?: WordHuntStats;
}

/** Lifetime Word Hunt progress, used to decide which badges a player has earned. */
export interface WordHuntStats {
  gamesPlayed: number;
  totalScore: number;
  /** Highest score in a single game. */
  bestScore: number;
  /** Consecutive days with at least one finished game, by board date (YYYY-MM-DD). */
  streak: { current: number; best: number; lastDate: string | null };
  foundTopia: boolean;
  /** Found a word with 7 or more letters. */
  foundLongWord: boolean;
}

export type WordHuntBadgeCategory = "play" | "score" | "special";

export interface WordHuntBadge {
  /** Matches the picture at /badges/<slug>.png. */
  slug: string;
  /** Name of the badge item in the Topia ecosystem inventory. */
  name: string;
  description: string;
  category: WordHuntBadgeCategory;
  earned: boolean;
  /** Progress toward the badge, for badges that count something. */
  progress: { current: number; target: number } | null;
}

export interface WordHuntBadgesResponse {
  badges: WordHuntBadge[];
}

export interface WordHuntLeaderboardEntry {
  profileId: string;
  name: string;
  score: number;
  rank: number;
}

export interface WordHuntLeaderboardResponse {
  /** Board date (YYYY-MM-DD) the scores belong to. */
  date: string;
  /** Top scores for the date, highest first. */
  entries: WordHuntLeaderboardEntry[];
  /** The requesting player's own entry, even if they are outside the top entries. */
  me: WordHuntLeaderboardEntry | null;
}
