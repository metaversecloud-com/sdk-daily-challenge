import { errorHandler, getCredentials, getDroppedAsset } from "@utils/index.js";
import type { ChallengeLeaderboardRow, ChallengeMode, ChallengeRun } from "@shared/types/WordQuestTypes.js";
import { getChallengeScore } from "./challenge.js";
import { boardKey, isBetter, LeaderboardEntry, parseEntry, serializeEntry, sortEntries } from "./challengeRanking.js";

type Credentials = ReturnType<typeof getCredentials>;

export const recordChallengeResult = async (credentials: Credentials, run: ChallengeRun) => {
  const { profileId, displayName } = credentials;
  const key = boardKey(run.mode);
  const droppedAsset = await getDroppedAsset(credentials);
  const data = (await droppedAsset.fetchDataObject()) as any;

  const score = getChallengeScore(run);
  const result: LeaderboardEntry = {
    displayName,
    wordsSolved: score.wordsSolved,
    totalGuesses: score.totalGuesses,
    timeLeftMs: score.timeLeftMs,
    runs: 1,
  };

  // Keep the player's best run, count every attempt
  const existing = parseEntry(data?.[key]?.[profileId]);
  const best = existing && !isBetter(run.mode, result, existing) ? existing : result;
  const value = serializeEntry({ ...best, displayName, runs: (existing?.runs ?? 0) + 1 });

  await droppedAsset.updateDataObject({ [`${key}.${profileId}`]: value });

  // Make sure it stuck. If not, rewrite the whole board under its top-level key.
  const check = (await droppedAsset.fetchDataObject()) as any;
  if (check?.[key]?.[profileId] !== value) {
    await droppedAsset.updateDataObject({ [key]: { ...(check?.[key] ?? {}), [profileId]: value } });
  }
};

// Never lets a leaderboard problem break the game
export const tryRecordChallengeResult = async (credentials: Credentials, run: ChallengeRun) => {
  try {
    await recordChallengeResult(credentials, run);
  } catch (error) {
    errorHandler({
      error,
      functionName: "tryRecordChallengeResult",
      message: "Error recording challenge leaderboard result",
    });
  }
};

export const getChallengeLeaderboard = async (
  credentials: Credentials,
  mode: ChallengeMode,
  limit = 10,
): Promise<ChallengeLeaderboardRow[]> => {
  const droppedAsset = await getDroppedAsset(credentials);
  const data = (await droppedAsset.fetchDataObject()) as any;
  const board = data?.[boardKey(mode)] ?? {};

  const entries = Object.values(board)
    .map(parseEntry)
    .filter((e): e is LeaderboardEntry => e !== null);

  return sortEntries(mode, entries).slice(0, limit);
};