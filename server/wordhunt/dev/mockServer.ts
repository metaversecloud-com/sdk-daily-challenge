/**
 * Local-only Word Hunt server for playing the game without a Topia world.
 *
 * Serves the same /api/wordhunt endpoints as the real server using the real board, dictionary,
 * and scoring logic, but keeps games in memory instead of on the Topia visitor data object.
 * It does not import the Topia SDK, so no .env or Topia credentials are needed.
 *
 * Usage (from server/):
 *   npx tsx wordhunt/dev/mockServer.ts
 *   WORDHUNT_GAME_SECONDS=15 npx tsx wordhunt/dev/mockServer.ts   # shorter games for testing
 *   WORDHUNT_MOCK_LATENCY_MS=400 npx tsx wordhunt/dev/mockServer.ts   # delay every response, like a slow Topia API
 *   WORDHUNT_MOCK_ADMIN=false npx tsx wordhunt/dev/mockServer.ts   # play as a non-admin (everyone is an admin by default)
 *   WORDHUNT_MOCK_PORT=3010 npx tsx wordhunt/dev/mockServer.ts   # use another port (the client proxies /api to 3000)
 *
 * Then run the client (`npm run dev` in client/) and open:
 *   http://localhost:3001/?assetId=local&interactiveNonce=local&interactivePublicKey=local&urlSlug=local&visitorId=1&sceneDropId=local&profileId=local
 */
import http from "http";
import { randomUUID } from "crypto";
import {
  WORD_HUNT_MODES,
  WordHuntAnalyticsCounters,
  WordHuntGame,
  WordHuntMode,
  WordHuntModeStatus,
  WordHuntStats,
  WordHuntSubmitResult,
} from "@shared/types/wordhunt/WordHuntTypes.js";
import { getMedal, isGoldenWord, scoreGoldenWord } from "@shared/wordhunt/golden.js";
import {
  buildAnalyticsResponse,
  combineStoredCounters,
  getFinishedGameIncrements,
  MAX_ANALYTICS_DAYS,
  toCounters,
} from "../utils/analyticsSummary.js";
import {
  buildBadgeList,
  getNewBadgeNames,
  LONG_WORD_LENGTH,
  recordFinishedGame,
  recordFinishedGoldenGame,
} from "../utils/badges.js";
import { getBoardDate, getDailyBoard, getDailyWordPoints, getWordFromPath } from "../utils/board.js";
import { getPointsForWord, GAME_DURATION_MS, LEADERBOARD_SIZE, MIN_WORD_LENGTH, SUBMISSION_GRACE_MS } from "../utils/constants.js";
import { isValidWord } from "../utils/dictionary.js";
import { getGameMode, parseMode, UNKNOWN_MODE_ERROR } from "../utils/mode.js";
import { getRevealedWordOfTheDay, getWordOfTheDay } from "../utils/wordOfTheDay.js";

const PORT = Number(process.env.WORDHUNT_MOCK_PORT) || 3000;
const GAME_DURATION = process.env.WORDHUNT_GAME_SECONDS ? Number(process.env.WORDHUNT_GAME_SECONDS) * 1000 : GAME_DURATION_MS;

// One game per visitor per mode, in memory.
const games = new Map<string, WordHuntGame>();
const getGameKey = (visitorId: string, mode: WordHuntMode) => `${visitorId}:${mode}`;
// Lifetime stats per visitorId, in memory (drives the Badges tab). Golden games only update the golden bests,
// like the real server.
const allStats = new Map<string, WordHuntStats>();

// Call after recordScore so the CROWN! check sees this game on today's leaderboard.
const recordFinish = (visitorId: string, game: WordHuntGame) => {
  const before = allStats.get(visitorId);
  const isGolden = getGameMode(game) === "golden";
  const after = isGolden ? recordFinishedGoldenGame(before, game) : recordFinishedGame(before, game);
  // CROWN! (classic only): this game's score tops today's classic leaderboard.
  const top = getLeaderboard(visitorId, "classic").entries[0];
  if (!isGolden && game.board.date === getBoardDate() && game.score > 0 && top && game.score >= top.score) {
    after.wonCrown = true;
  }
  allStats.set(visitorId, after);
  return getNewBadgeNames(before, after);
};

// Today's best score per visitorId, per mode (leaderboard.ts needs the Topia SDK, so the mock keeps its own copy).
const leaderboards = Object.fromEntries(
  WORD_HUNT_MODES.map((mode) => [mode, { date: "", scores: new Map<string, { name: string; score: number }>() }]),
) as Record<WordHuntMode, { date: string; scores: Map<string, { name: string; score: number }> }>;

// Per-mode, per-day analytics counters, same shape as the real server's on the dropped asset.
const analytics = Object.fromEntries(WORD_HUNT_MODES.map((mode) => [mode, {}])) as Record<
  WordHuntMode,
  Record<string, WordHuntAnalyticsCounters>
>;
const addToAnalytics = (mode: WordHuntMode, date: string, increments: Partial<WordHuntAnalyticsCounters>) => {
  const counters = (analytics[mode][date] ??= toCounters(undefined));
  for (const [name, amount] of Object.entries(increments)) counters[name as keyof WordHuntAnalyticsCounters] += amount;
};
// Board date each visitor last used "Reset my play" on; their later games that day are replays (not counted).
const replayDates = new Map<string, string>();
const recordFinishAnalytics = (game: WordHuntGame) => {
  if (game.isReplay) return;
  const mode = getGameMode(game);
  addToAnalytics(
    mode,
    game.board.date,
    getFinishedGameIncrements({
      wordsFound: game.foundWords.length,
      score: game.score,
      secondsPlayed: Math.round(((game.endedAt ?? game.endsAt) - game.startedAt) / 1000),
      endReason: game.endReason,
      longWordsFound: game.foundWords.filter(({ word }) => word.length >= LONG_WORD_LENGTH).length,
      foundWordOfTheDay: game.foundWords.some(({ word }) => word === getWordOfTheDay(game.board.date, mode)?.word),
      ...(mode === "golden" && {
        goldenLetterWordsFound: game.foundWords.filter(({ word }) => isGoldenWord(word, game.board.goldenLetter)).length,
        medal: getMedal(game.score, game.board.goals),
      }),
    }),
  );
};

// Each finished game is recorded once, like the real server, so an admin clearing the board isn't undone by the next fetch.
const recordedGameIds = new Set<string>();

const recordScore = (visitorId: string, displayName: string, game: WordHuntGame) => {
  if (recordedGameIds.has(game.gameId)) return;
  recordedGameIds.add(game.gameId);
  const date = getBoardDate();
  if (game.board.date !== date || game.score <= 0) return;
  const leaderboard = leaderboards[getGameMode(game)];
  if (leaderboard.date !== date) {
    leaderboard.date = date;
    leaderboard.scores.clear();
  }
  if ((leaderboard.scores.get(visitorId)?.score ?? 0) < game.score) {
    leaderboard.scores.set(visitorId, { name: displayName, score: game.score });
  }
};

const getLeaderboard = (visitorId: string, mode: WordHuntMode) => {
  const date = getBoardDate();
  const leaderboard = leaderboards[mode];
  const ranked = (leaderboard.date === date ? [...leaderboard.scores] : [])
    .map(([profileId, { name, score }]) => ({ profileId, name, score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  return { date, entries: ranked.slice(0, LEADERBOARD_SIZE), me: ranked.find((e) => e.profileId === visitorId) || null };
};

const LATENCY_MS = Number(process.env.WORDHUNT_MOCK_LATENCY_MS) || 0;
const IS_ADMIN = process.env.WORDHUNT_MOCK_ADMIN !== "false";

const sendJson = (res: http.ServerResponse, status: number, body: object) => {
  setTimeout(() => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }, LATENCY_MS);
};

const isActive = (game: WordHuntGame | undefined): game is WordHuntGame =>
  !!game && !game.endedAt && Date.now() <= game.endsAt + SUBMISSION_GRACE_MS;

// Same rule as getValidWordsForGame in gameState.ts (which the mock can't import, since it loads the Topia SDK).
const getValidWords = (game: WordHuntGame | undefined) =>
  isActive(game) && game.board.date === getBoardDate() ? getDailyWordPoints(undefined, getGameMode(game)) : undefined;

const finalizeIfExpired = (game: WordHuntGame | undefined) => {
  if (game && !game.endedAt && Date.now() > game.endsAt + SUBMISSION_GRACE_MS) {
    game.endedAt = game.endsAt;
    game.endReason = "timeout";
  }
};

const getModes = (visitorId: string) =>
  Object.fromEntries(
    WORD_HUNT_MODES.map((mode): [WordHuntMode, WordHuntModeStatus] => {
      const game = games.get(getGameKey(visitorId, mode));
      if (!game || game.board.date !== getBoardDate()) return [mode, "not_started"];
      return [mode, isActive(game) ? "in_progress" : "finished"];
    }),
  ) as Record<WordHuntMode, WordHuntModeStatus>;

const server = http.createServer((req, res) => {
  let rawBody = "";
  req.on("data", (chunk) => (rawBody += chunk));
  req.on("end", () => {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);
    const visitorId = url.searchParams.get("visitorId") || "local";
    const displayName = url.searchParams.get("displayName") || `Player ${visitorId}`;
    const body = rawBody ? JSON.parse(rawBody) : {};
    // "all" is only meaningful for the stats route, which reads it itself.
    const rawMode = url.searchParams.get("mode") ?? undefined;
    const mode = parseMode(rawMode === "all" ? undefined : rawMode);
    if (!mode) return sendJson(res, 400, UNKNOWN_MODE_ERROR);
    const board = getDailyBoard(undefined, mode);
    const gameKey = getGameKey(visitorId, mode);
    let game = games.get(gameKey);
    const ok = (data: object) => sendJson(res, 200, { success: true, data: { ...data, serverTime: Date.now() } });

    switch (`${req.method} ${url.pathname}`) {
      // The shared route (one for every challenge) that the client uses on word-games: Word Hunt only here.
      case "GET /api/game-state":
        if (url.searchParams.get("game") !== "wordhunt") {
          return sendJson(res, 404, { success: false, error: "The Word Hunt mock only handles game=wordhunt" });
        }
      // falls through
      case "GET /api/wordhunt/game-state":
        finalizeIfExpired(game);
        return ok({
          board,
          game: game || null,
          wordOfTheDay: getRevealedWordOfTheDay(game || null),
          validWords: getValidWords(game),
          isAdmin: IS_ADMIN,
          mode,
          modes: getModes(visitorId),
        });

      case "POST /api/wordhunt/admin/clear-leaderboard":
        if (!IS_ADMIN) return sendJson(res, 403, { success: false, error: "Only world admins can do that." });
        for (const leaderboard of Object.values(leaderboards)) leaderboard.scores.clear();
        return ok(getLeaderboard(visitorId, "classic"));

      case "GET /api/wordhunt/admin/analytics": {
        if (!IS_ADMIN) return sendJson(res, 403, { success: false, error: "Only world admins can do that." });
        const requested = Number(url.searchParams.get("days"));
        const days = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_ANALYTICS_DAYS) : 7;
        // Both modes together unless a single mode is asked for.
        const statsMode = url.searchParams.get("mode") ?? "all";
        const stored = statsMode === "all" ? combineStoredCounters(Object.values(analytics)) : analytics[mode];
        return ok(buildAnalyticsResponse(stored, getBoardDate(), days));
      }

      case "POST /api/wordhunt/admin/reset-play":
        if (!IS_ADMIN) return sendJson(res, 403, { success: false, error: "Only world admins can do that." });
        for (const forMode of WORD_HUNT_MODES) games.delete(getGameKey(visitorId, forMode));
        replayDates.set(visitorId, board.date);
        return ok({ board: getDailyBoard(), game: null, isAdmin: true, mode: "classic", modes: getModes(visitorId) });

      case "GET /api/wordhunt/leaderboard":
        finalizeIfExpired(game);
        if (game?.endedAt) recordScore(visitorId, displayName, game);
        return ok(getLeaderboard(visitorId, mode));

      case "GET /api/wordhunt/badges":
        return ok({ badges: buildBadgeList(allStats.get(visitorId)) });

      case "POST /api/wordhunt/start": {
        // One game per daily board: a finished game on today's board is returned instead of starting a new one.
        if (game && game.board.date === board.date && !isActive(game)) {
          finalizeIfExpired(game);
          return ok({ board, game, wordOfTheDay: getRevealedWordOfTheDay(game), mode, modes: getModes(visitorId) });
        }
        if (!isActive(game)) {
          const now = Date.now();
          game = {
            ...(replayDates.get(visitorId) === board.date && { isReplay: true }),
            ...(mode !== "classic" && { mode, goldenStreak: 0 }),
            gameId: randomUUID(),
            board,
            startedAt: now,
            endsAt: now + GAME_DURATION,
            endedAt: null,
            endReason: null,
            score: 0,
            foundWords: [],
          };
          games.set(gameKey, game);
          if (!game.isReplay) addToAnalytics(mode, game.board.date, { gamesStarted: 1 });
        }
        return ok({ board, game, validWords: getValidWords(game), mode, modes: getModes(visitorId) });
      }

      case "POST /api/wordhunt/submit-word": {
        if (!game || game.gameId !== body.gameId) return sendJson(res, 400, { success: false, error: "No game" });
        const current = game;
        const respond = (result: WordHuntSubmitResult, word = "", points = 0, extra: object = {}) =>
          ok({ result, word, points, ...extra, game: current });

        finalizeIfExpired(current);
        if (current.endedAt) return respond("game_over");
        const word = getWordFromPath(current.board, body.path);
        if (word === null) return respond("invalid_path");
        if (word.length < MIN_WORD_LENGTH) return respond("too_short", word);
        if (current.foundWords.some((found) => found.word === word)) return respond("already_found", word);
        if (!isValidWord(word)) return respond("not_a_word", word);

        const basePoints = getPointsForWord(word);
        if (mode === "golden") {
          const { points, multiplier, streak } = scoreGoldenWord(
            word,
            basePoints,
            current.board.goldenLetter,
            current.goldenStreak ?? 0,
          );
          current.foundWords.push({ word, points });
          current.score += points;
          current.goldenStreak = streak;
          current.goldenBestStreak = Math.max(current.goldenBestStreak ?? 0, streak);
          return respond("valid", word, points, { multiplier, goldenStreak: streak });
        }
        current.foundWords.push({ word, points: basePoints });
        current.score += basePoints;
        return respond("valid", word, basePoints);
      }

      case "POST /api/wordhunt/end": {
        if (!game || game.gameId !== body.gameId) return sendJson(res, 400, { success: false, error: "No game" });
        let newBadges: string[] = [];
        if (!game.endedAt) {
          const now = Date.now();
          game.endedAt = Math.min(now, game.endsAt);
          game.endReason = now >= game.endsAt - 2000 ? "timeout" : "quit";
          recordScore(visitorId, displayName, game);
          newBadges = recordFinish(visitorId, game);
          recordFinishAnalytics(game);
        }
        return ok({ board, game, newBadges, wordOfTheDay: getRevealedWordOfTheDay(game), mode, modes: getModes(visitorId) });
      }

      default:
        return sendJson(res, 404, { success: false, error: `Not handled by the Word Hunt mock: ${url.pathname}` });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Word Hunt mock server on http://localhost:${PORT} (games last ${GAME_DURATION / 1000}s)`);
  console.log(
    "Open: http://localhost:3001/?assetId=local&interactiveNonce=local&interactivePublicKey=local&urlSlug=local&visitorId=1&sceneDropId=local&profileId=local",
  );
});
