import { getDroppedAsset } from "@utils/index.js";
import type { LeaderboardRow } from "@shared/types/WordQuestTypes.js";

// Stored per player as "displayName|wordsCorrect|totalGuesses"
// totalGuesses counts guesses used on solved words only.

// A pipe in a display name would break the parsing, so strip it
const cleanName = (name: string) => (name || "").replace(/\|/g, "").trim() || "Player";

// Called once when a game ends
export const recordLeaderboardResult = async (credentials: any, won: boolean, guessesUsed: number) => {
  const { profileId } = credentials;
  const displayName = cleanName(credentials.displayName);

  const droppedAsset = await getDroppedAsset(credentials);
  const data = await droppedAsset.fetchDataObject();
  const board: Record<string, string> | undefined = data?.leaderboard;

  const [, prevWords = "0", prevGuesses = "0"] = (board?.[profileId] ?? "").split("|");
  const wordsCorrect = (parseInt(prevWords) || 0) + (won ? 1 : 0);
  const totalGuesses = (parseInt(prevGuesses) || 0) + (won ? guessesUsed : 0);
  const entry = `${displayName}|${wordsCorrect}|${totalGuesses}`;

  if (board) {
    // Only this player's entry is written
    await droppedAsset.updateDataObject({ [`leaderboard.${profileId}`]: entry });
  } else {
    await droppedAsset.updateDataObject({ leaderboard: { [profileId]: entry } });
  }
};

export const getLeaderboard = async (credentials: any, limit = 20): Promise<LeaderboardRow[]> => {
  const droppedAsset = await getDroppedAsset(credentials);
  const data = await droppedAsset.fetchDataObject();
  const board: Record<string, unknown> = data?.leaderboard ?? {};

  const rows: LeaderboardRow[] = Object.values(board)
    .filter((v): v is string => typeof v === "string")
    .map((v) => {
      const [name, words, guesses] = v.split("|");
      const wordsCorrect = parseInt(words) || 0;
      const totalGuesses = parseInt(guesses) || 0;
      return {
        displayName: name || "Player",
        wordsCorrect,
        totalGuesses,
        averageGuesses: wordsCorrect > 0 ? totalGuesses / wordsCorrect : null,
      };
    });

  // Most words first; ties go to the lower average; unsolved players last
  rows.sort((a, b) => {
    if (b.wordsCorrect !== a.wordsCorrect) return b.wordsCorrect - a.wordsCorrect;
    if (a.averageGuesses === null && b.averageGuesses === null) return a.displayName.localeCompare(b.displayName);
    if (a.averageGuesses === null) return 1;
    if (b.averageGuesses === null) return -1;
    return a.averageGuesses - b.averageGuesses;
  });

  return rows.slice(0, limit);
};