import { AnalyticType } from "@rtsdk/topia";
import { WordHuntAnalyticsCounters, WordHuntGame } from "@shared/types/wordhunt/WordHuntTypes.js";
import { errorHandler } from "@utils/errorHandler.js";
import { getDroppedAsset } from "@utils/droppedAssets/getDroppedAsset.js";
import { standardizeError } from "@utils/standardizeError.js";
import { DroppedAsset } from "@utils/topiaInit.js";
import { Credentials } from "../../types/index.js";
import { buildAnalyticsResponse, getFinishedGameIncrements } from "./analyticsSummary.js";
import { LONG_WORD_LENGTH } from "./badges.js";
import { getBoardDate } from "./board.js";
import { getWordOfTheDay } from "./wordOfTheDay.js";

/*
 * Word Hunt analytics, recorded two ways:
 * 1. Topia analytics events (see .ai/examples/analyticsTracking.md), attached to saves the game already makes, so
 *    they cost no extra requests. These show up in the Topia dashboard.
 * 2. Per-day counters on the dropped asset (`wordHuntAnalytics.<board date>.<counter>`), which the admin analytics
 *    endpoint reads back to work out completion rates and averages. These are recorded in the background and
 *    never slow down or fail a player's request.
 */

const ANALYTICS_KEY = "wordHuntAnalytics";

const getLongWordCount = (game: WordHuntGame) =>
  game.foundWords.filter(({ word }) => word.length >= LONG_WORD_LENGTH).length;

const getSecondsPlayed = (game: WordHuntGame) =>
  Math.max(0, Math.round(((game.endedAt ?? game.endsAt) - game.startedAt) / 1000));

const foundWordOfTheDay = (game: WordHuntGame) => {
  const wordOfTheDay = getWordOfTheDay(game.board.date)?.word;
  return !!wordOfTheDay && game.foundWords.some(({ word }) => word === wordOfTheDay);
};

/** Topia analytics events for a new game. One "starts" per game; none for an admin's replay. */
export const getGameStartedAnalytics = ({ profileId, urlSlug }: Credentials, game: WordHuntGame): AnalyticType[] =>
  game.isReplay ? [] : [{ analyticName: "starts", profileId, urlSlug, uniqueKey: `${profileId}-${game.gameId}` }];

/** Topia analytics events for a game that just ended (each counted once per game; none for an admin's replay). */
export const getGameFinishedAnalytics = (
  { profileId, urlSlug }: Credentials,
  game: WordHuntGame,
  newBadges: string[],
): AnalyticType[] => {
  if (game.isReplay) return [];
  const perGame = (analyticName: string, incrementBy?: number): AnalyticType => ({
    analyticName,
    profileId,
    urlSlug,
    uniqueKey: `${profileId}-${game.gameId}`,
    ...(incrementBy !== undefined && { incrementBy }),
  });
  const longWords = getLongWordCount(game);
  return [
    perGame("completions"),
    perGame(game.endReason === "quit" ? "quits" : "timeouts"),
    ...(game.foundWords.length > 0 ? [perGame("wordsFound", game.foundWords.length)] : []),
    ...(game.score > 0 ? [perGame("pointsScored", game.score)] : []),
    ...(longWords > 0 ? [perGame("longWordsFound", longWords)] : []),
    ...(foundWordOfTheDay(game) ? [perGame("wordOfTheDayFound")] : []),
    ...newBadges.map(
      (badge): AnalyticType => ({ analyticName: "badgesAwarded", profileId, urlSlug, uniqueKey: `${profileId}-${badge}` }),
    ),
  ];
};

/** Adds to today's counters on the dropped asset, in parallel. Never throws: analytics must not break the game. */
const incrementCounters = async (credentials: Credentials, date: string, increments: Partial<WordHuntAnalyticsCounters>) => {
  try {
    // DroppedAsset.create makes no request; each increment is a single atomic update, safe with many players at once.
    const droppedAsset = DroppedAsset.create(credentials.assetId, credentials.urlSlug, { credentials });
    await Promise.all(
      Object.entries(increments).map(([counter, amount]) =>
        droppedAsset.incrementDataObjectValue(`${ANALYTICS_KEY}.${date}.${counter}`, amount as number, {}),
      ),
    );
  } catch (error) {
    errorHandler({ error, functionName: "incrementCounters", message: "Error recording Word Hunt analytics" });
  }
};

// Admin replays (games after "Reset my play") aren't counted.
export const recordGameStarted = async (credentials: Credentials, game: WordHuntGame) => {
  if (!game.isReplay) await incrementCounters(credentials, game.board.date, { gamesStarted: 1 });
};

export const recordGameFinished = async (credentials: Credentials, game: WordHuntGame) => {
  if (game.isReplay) return;
  await incrementCounters(
    credentials,
    game.board.date,
    getFinishedGameIncrements({
      wordsFound: game.foundWords.length,
      score: game.score,
      secondsPlayed: getSecondsPlayed(game),
      endReason: game.endReason,
      longWordsFound: getLongWordCount(game),
      foundWordOfTheDay: foundWordOfTheDay(game),
    }),
  );
};

/** Counters, rates and averages for the last `days` board days (newest first) plus their totals. */
export const getAnalyticsSummary = async (credentials: Credentials, days: number) => {
  try {
    const droppedAsset = await getDroppedAsset(credentials);
    const stored = (droppedAsset.dataObject as Record<string, unknown> | undefined)?.[ANALYTICS_KEY];
    return buildAnalyticsResponse(stored as Record<string, unknown> | undefined, getBoardDate(), days);
  } catch (error) {
    throw standardizeError(error);
  }
};
