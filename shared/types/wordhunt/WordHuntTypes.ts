/**
 * Word Hunt types shared between client and server.
 */

/**
 * Game modes. Each mode has its own daily board, one game per player per day, and its own leaderboard and analytics.
 * - classic: the original game.
 * - golden: a daily "golden letter"; words containing it score double, with a streak bonus for golden words in a
 *   row, and bronze/silver/gold score goals. Golden games don't count toward badges or lifetime stats.
 */
export type WordHuntMode = "classic" | "golden";
export const WORD_HUNT_MODES: WordHuntMode[] = ["classic", "golden"];

/** Whether a player hasn't started today's board in a mode yet, is playing it, or has finished it. */
export type WordHuntModeStatus = "not_started" | "in_progress" | "finished";

/** Bronze, silver, and gold score targets for a golden board. */
export interface WordHuntGoals {
  bronze: number;
  silver: number;
  gold: number;
}

export interface WordHuntBoard {
  /** Board date (YYYY-MM-DD) in the server's board timezone. */
  date: string;
  /** Number of rows/columns. */
  size: number;
  /** Tiles in row-major order. Each tile is one letter, except "Qu". */
  tiles: string[];
  /** Golden mode only: today's golden letter (lowercase). */
  goldenLetter?: string;
  /** Golden mode only: today's score goals. */
  goals?: WordHuntGoals;
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
  /** An admin's extra game after resetting their play (for testing). Left out of analytics. */
  isReplay?: boolean;
  /** Golden mode only (missing means classic). */
  mode?: WordHuntMode;
  /** Golden mode only: how many golden words in a row the player has found (a non-golden word resets it). */
  goldenStreak?: number;
  /** Golden mode only: the longest golden streak reached this game (for the Gold Rush! badge). */
  goldenBestStreak?: number;
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
  /** Today's word of the day. Only sent once the player's game on today's board has ended, so it can't be peeked at. */
  wordOfTheDay?: WordHuntWordOfTheDay;
  /**
   * Every word on today's board with its points, sent while today's game is in progress so the client can show
   * results instantly. The server still checks every word. (The board itself is public, so this reveals nothing a
   * solver couldn't find.)
   */
  validWords?: Record<string, number>;
  /** Whether the player is an admin of this world (shows the admin tools). Only sent by GET /game-state. */
  isAdmin?: boolean;
  /** Which mode this response is for. */
  mode?: WordHuntMode;
  /** Each mode's status for today, so the start screen can show both. Sent by GET /game-state and POST /start. */
  modes?: Record<WordHuntMode, WordHuntModeStatus>;
}

export type WordHuntPartOfSpeech = "noun" | "verb" | "adjective" | "adverb";

export interface WordHuntDefinition {
  partOfSpeech: WordHuntPartOfSpeech;
  text: string;
  /** The dictionary form the definition belongs to when it differs from the word, e.g. "rematch" for "rematches". */
  baseWord: string | null;
}

/** The longest word that can be made on the day's board. */
export interface WordHuntWordOfTheDay {
  word: string;
  points: number;
  /** null when WordNet has no definition for the word. */
  definition: WordHuntDefinition | null;
}

export interface WordHuntSubmitWordResponse {
  result: WordHuntSubmitResult;
  word: string;
  points: number;
  /** Golden mode: the multiplier applied to a valid word (1 when it has no golden letter). */
  multiplier?: number;
  /** Golden mode: golden words in a row after this word. */
  goldenStreak?: number;
  game: WordHuntGame;
  serverTime: number;
}

/**
 * How a game is saved on the visitor data object. Found words are a map (word -> points) so each word can be
 * saved on its own, which lets several words be submitted at once without one save overwriting another.
 * `foundWords`/`score` are only present on games saved before this format; they're merged in when loading.
 */
export interface WordHuntStoredGame extends Omit<WordHuntGame, "foundWords" | "score"> {
  found?: Record<string, number>;
  foundWords?: WordHuntFoundWord[];
  score?: number;
}

/** Shape of the Word Hunt data stored on the visitor data object under `${urlSlug}-${sceneDropId}`. */
export interface WordHuntVisitorData {
  game: WordHuntStoredGame | null;
  stats?: WordHuntStats;
  /** Board date (YYYY-MM-DD) an admin last reset their play on. Their later games that day are replays. */
  replayDate?: string;
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
  /**
   * Golden Letter bests, for the golden badges. These are the only stats golden games update (they don't count
   * toward games played, scores, or streaks above). Missing on stats saved before golden badges existed.
   */
  goldenBestStreak?: number;
  /** Most golden-letter words found in one golden game. */
  goldenMostWords?: number;
}

export type WordHuntBadgeCategory = "play" | "score" | "special" | "golden";

export interface WordHuntBadge {
  slug: string;
  /** The badge picture's path, e.g. /badges/<slug>.png. */
  image: string;
  /** Name of the badge item in the Topia ecosystem inventory. */
  name: string;
  description: string;
  category: WordHuntBadgeCategory;
  /** The game mode whose games earn this badge. */
  mode: WordHuntMode;
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

/** Raw per-day counters kept on the dropped asset under `wordHuntAnalytics.<YYYY-MM-DD>` (by board date). */
export interface WordHuntAnalyticsCounters {
  /** Games started (admin replays aren't counted). */
  gamesStarted: number;
  /** Games that ended, by quitting early or by the timer running out. */
  gamesCompleted: number;
  gamesQuit: number;
  gamesTimedOut: number;
  /** Finished games where the player found no words. */
  gamesWithNoWords: number;
  /** Totals across finished games. */
  wordsFound: number;
  pointsScored: number;
  secondsPlayed: number;
  /** Words of 7+ letters found. */
  longWordsFound: number;
  /** Finished games where the player found the word of the day. */
  wordOfTheDayFound: number;
  /** Golden mode only (always 0 for classic): words containing the golden letter. */
  goldenLetterWordsFound: number;
  /** Golden mode only: finished games that reached each score goal (a gold game counts once, as gold). */
  goalsBronze: number;
  goalsSilver: number;
  goalsGold: number;
}

/** Counters plus the rates and averages worked out from them, for one day or a range of days. */
export interface WordHuntAnalyticsSummary extends WordHuntAnalyticsCounters {
  /** gamesCompleted / gamesStarted (0–1), or null with no games started. */
  completionRate: number | null;
  /** gamesQuit / gamesCompleted (0–1), or null with no finished games. Averages below are per finished game. */
  quitRate: number | null;
  averageWordsFound: number | null;
  averageScore: number | null;
  averageSecondsPlayed: number | null;
  /** Share of finished games that found the word of the day (0–1). */
  wordOfTheDayFindRate: number | null;
  /** Golden mode: golden-letter words per finished game. */
  averageGoldenLetterWords: number | null;
  /** Golden mode: share of finished games that reached at least the bronze goal (0–1). */
  goalReachedRate: number | null;
}

export interface WordHuntAnalyticsDay extends WordHuntAnalyticsSummary {
  /** Board date (YYYY-MM-DD). */
  date: string;
}

export interface WordHuntAnalyticsResponse {
  /** One entry per day, newest first, including days with no games. */
  days: WordHuntAnalyticsDay[];
  /** All the days above combined. */
  totals: WordHuntAnalyticsSummary;
}
