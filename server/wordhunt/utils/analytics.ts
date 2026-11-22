import { AnalyticType } from "@rtsdk/topia";
import { WORD_HUNT_MODES, WordHuntAnalyticsCounters, WordHuntGame, WordHuntMode } from "@shared/types/wordhunt/WordHuntTypes.js";
import { getMedal, isGoldenWord } from "@shared/wordhunt/golden.js";
import { errorHandler } from "@utils/errorHandler.js";
import { getDroppedAsset } from "@utils/droppedAssets/getDroppedAsset.js";
import { standardizeError } from "@utils/standardizeError.js";
import { DroppedAsset } from "@utils/topiaInit.js";
import { Credentials } from "../../types/index.js";
import { buildAnalyticsResponse, combineStoredCounters, getFinishedGameIncrements } from "./analyticsSummary.js";
import { LONG_WORD_LENGTH } from "./badges.js";
import { getBoardDate } from "./board.js";
import { getGameMode } from "./mode.js";
import { getWordOfTheDay } from "./wordOfTheDay.js";

/*
 * Word Hunt analytics, recorded two ways:
 * 1. Topia analytics events (see .ai/examples/analyticsTracking.md), attached to saves the game already makes, so
 *    they cost no extra requests. These show up in the Topia dashboard.
 * 2. Per-day counters on the dropped asset (`wordHuntAnalytics.<board date>.<counter>`), which the admin analytics
 *    endpoint reads back to work out completion rates and averages. These are recorded in the background and
 *    never slow down or fail a player's request.
 */

/** Each mode keeps separate counters and Topia event names, so golden games never mix into classic stats. */
const getAnalyticsKey = (mode: WordHuntMode) => (mode === "classic" ? "wordHuntAnalytics" : "wordHuntGoldenAnalytics");
/** Classic events keep their original names ("starts"); golden ones are prefixed ("goldenStarts"). */
const getEventName = (mode: WordHuntMode, name: string) =>
  mode === "classic" ? name : `${mode}${name[0].toUpperCase()}${name.slice(1)}`;

const getLongWordCount = (game: WordHuntGame) =>
  game.foundWords.filter(({ word }) => word.length >= LONG_WORD_LENGTH).length;

const getSecondsPlayed = (game: WordHuntGame) =>
  Math.max(0, Math.round(((game.endedAt ?? game.endsAt) - game.startedAt) / 1000));

const getGoldenLetterWordCount = (game: WordHuntGame) =>
  game.foundWords.filter(({ word }) => isGoldenWord(word, game.board.goldenLetter)).length;

const foundWordOfTheDay = (game: WordHuntGame) => {
  const wordOfTheDay = getWordOfTheDay(game.board.date, getGameMode(game))?.word;
  return !!wordOfTheDay && game.foundWords.some(({ word }) => word === wordOfTheDay);
};

/**
 * Topia event names for a game event. Every game records the shared name ("starts"), so the dashboard counts both
 * modes together; golden games also record a prefixed copy ("goldenStarts"), so golden can be viewed on its own.
 */
const getEventNames = (mode: WordHuntMode, name: string) =>
  mode === "classic" ? [name] : [name, getEventName(mode, name)];

/** Topia analytics events for a new game. One "starts" per game; none for an admin's replay. */
export const getGameStartedAnalytics = ({ profileId, urlSlug }: Credentials, game: WordHuntGame): AnalyticType[] =>
  game.isReplay
    ? []
    : getEventNames(getGameMode(game), "starts").map((analyticName) => ({
        analyticName,
        profileId,
        urlSlug,
        uniqueKey: `${profileId}-${game.gameId}`,
      }));

/** Topia analytics events for a game that just ended (each counted once per game; none for an admin's replay). */
export const getGameFinishedAnalytics = (
  { profileId, urlSlug }: Credentials,
  game: WordHuntGame,
  newBadges: string[],
): AnalyticType[] => {
  if (game.isReplay) return [];
  const mode = getGameMode(game);
  const event = (analyticName: string, incrementBy?: number): AnalyticType => ({
    analyticName,
    profileId,
    urlSlug,
    uniqueKey: `${profileId}-${game.gameId}`,
    ...(incrementBy !== undefined && { incrementBy }),
  });
  // Shared across modes (plus a golden copy for golden games).
  const perGame = (name: string, incrementBy?: number) => getEventNames(mode, name).map((n) => event(n, incrementBy));
  // Golden-only events.
  const goldenOnly = (name: string, incrementBy?: number) => [event(getEventName("golden", name), incrementBy)];

  const longWords = getLongWordCount(game);
  const goldenWords = getGoldenLetterWordCount(game);
  const medal = mode === "golden" ? getMedal(game.score, game.board.goals) : null;
  return [
    ...perGame("completions"),
    ...perGame(game.endReason === "quit" ? "quits" : "timeouts"),
    ...(game.foundWords.length > 0 ? perGame("wordsFound", game.foundWords.length) : []),
    ...(game.score > 0 ? perGame("pointsScored", game.score) : []),
    ...(longWords > 0 ? perGame("longWordsFound", longWords) : []),
    ...(foundWordOfTheDay(game) ? perGame("wordOfTheDayFound") : []),
    ...(mode === "golden" && goldenWords > 0 ? goldenOnly("letterWordsFound", goldenWords) : []),
    ...(medal ? goldenOnly(`${medal}Goals`) : []),
    ...newBadges.map(
      (badge): AnalyticType => ({ analyticName: "badgesAwarded", profileId, urlSlug, uniqueKey: `${profileId}-${badge}` }),
    ),
  ];
};

/** Adds to today's counters on the dropped asset, in parallel. Never throws: analytics must not break the game. */
const incrementCounters = async (
  credentials: Credentials,
  mode: WordHuntMode,
  date: string,
  increments: Partial<WordHuntAnalyticsCounters>,
) => {
  try {
    // DroppedAsset.create makes no request; each increment is a single atomic update, safe with many players at once.
    const droppedAsset = DroppedAsset.create(credentials.assetId, credentials.urlSlug, { credentials });
    await Promise.all(
      Object.entries(increments).map(([counter, amount]) =>
        droppedAsset.incrementDataObjectValue(`${getAnalyticsKey(mode)}.${date}.${counter}`, amount as number, {}),
      ),
    );
  } catch (error) {
    errorHandler({ error, functionName: "incrementCounters", message: "Error recording Word Hunt analytics" });
  }
};

// Admin replays (games after "Reset my play") aren't counted.
export const recordGameStarted = async (credentials: Credentials, game: WordHuntGame) => {
  if (!game.isReplay) await incrementCounters(credentials, getGameMode(game), game.board.date, { gamesStarted: 1 });
};

export const recordGameFinished = async (credentials: Credentials, game: WordHuntGame) => {
  if (game.isReplay) return;
  const mode = getGameMode(game);
  await incrementCounters(
    credentials,
    mode,
    game.board.date,
    getFinishedGameIncrements({
      wordsFound: game.foundWords.length,
      score: game.score,
      secondsPlayed: getSecondsPlayed(game),
      endReason: game.endReason,
      longWordsFound: getLongWordCount(game),
      foundWordOfTheDay: foundWordOfTheDay(game),
      ...(mode === "golden" && {
        goldenLetterWordsFound: getGoldenLetterWordCount(game),
        medal: getMedal(game.score, game.board.goals),
      }),
    }),
  );
};

/**
 * Counters, rates and averages over the last `days` board days (newest first) plus their totals, for one mode or
 * for every mode added together ("all").
 */
export const getAnalyticsSummary = async (credentials: Credentials, days: number, mode: WordHuntMode | "all" = "all") => {
  try {
    const droppedAsset = await getDroppedAsset(credentials);
    const dataObject = droppedAsset.dataObject as Record<string, unknown> | undefined;
    const storedFor = (forMode: WordHuntMode) => dataObject?.[getAnalyticsKey(forMode)] as Record<string, unknown> | undefined;
    const stored = mode === "all" ? combineStoredCounters(WORD_HUNT_MODES.map(storedFor)) : storedFor(mode);
    return buildAnalyticsResponse(stored, getBoardDate(), days);
  } catch (error) {
    throw standardizeError(error);
  }
};
