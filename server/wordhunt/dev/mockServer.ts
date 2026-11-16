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
  WordHuntAnalyticsCounters,
  WordHuntGame,
  WordHuntStats,
  WordHuntSubmitResult,
} from "@shared/types/wordhunt/WordHuntTypes.js";
import { buildAnalyticsResponse, getFinishedGameIncrements, MAX_ANALYTICS_DAYS, toCounters } from "../utils/analyticsSummary.js";
import { buildBadgeList, getNewBadgeNames, LONG_WORD_LENGTH, recordFinishedGame } from "../utils/badges.js";
import { getBoardDate, getDailyBoard, getDailyWordPoints, getWordFromPath } from "../utils/board.js";
import { getPointsForWord, GAME_DURATION_MS, LEADERBOARD_SIZE, MIN_WORD_LENGTH, SUBMISSION_GRACE_MS } from "../utils/constants.js";
import { isValidWord } from "../utils/dictionary.js";
import { getRevealedWordOfTheDay, getWordOfTheDay } from "../utils/wordOfTheDay.js";

const PORT = Number(process.env.WORDHUNT_MOCK_PORT) || 3000;
const GAME_DURATION = process.env.WORDHUNT_GAME_SECONDS ? Number(process.env.WORDHUNT_GAME_SECONDS) * 1000 : GAME_DURATION_MS;

// One game per visitorId, in memory.
const games = new Map<string, WordHuntGame>();
// Lifetime stats per visitorId, in memory (drives the Badges tab).
const allStats = new Map<string, WordHuntStats>();

const recordFinish = (visitorId: string, game: WordHuntGame) => {
  const before = allStats.get(visitorId);
  const after = recordFinishedGame(before, game);
  allStats.set(visitorId, after);
  return getNewBadgeNames(before, after);
};

// Today's best score per visitorId (leaderboard.ts needs the Topia SDK, so the mock keeps its own copy of the logic).
const leaderboard = { date: "", scores: new Map<string, { name: string; score: number }>() };

// Per-day analytics counters, same shape as the real server's `wordHuntAnalytics` on the dropped asset.
const analytics: Record<string, WordHuntAnalyticsCounters> = {};
const addToAnalytics = (date: string, increments: Partial<WordHuntAnalyticsCounters>) => {
  const counters = (analytics[date] ??= toCounters(undefined));
  for (const [name, amount] of Object.entries(increments)) counters[name as keyof WordHuntAnalyticsCounters] += amount;
};
// Board date each visitor last used "Reset my play" on; their later games that day are replays (not counted).
const replayDates = new Map<string, string>();
const recordFinishAnalytics = (game: WordHuntGame) =>
  !game.isReplay &&
  addToAnalytics(
    game.board.date,
    getFinishedGameIncrements({
      wordsFound: game.foundWords.length,
      score: game.score,
      secondsPlayed: Math.round(((game.endedAt ?? game.endsAt) - game.startedAt) / 1000),
      endReason: game.endReason,
      longWordsFound: game.foundWords.filter(({ word }) => word.length >= LONG_WORD_LENGTH).length,
      foundWordOfTheDay: game.foundWords.some(({ word }) => word === getWordOfTheDay(game.board.date)?.word),
    }),
  );

// Each finished game is recorded once, like the real server, so an admin clearing the board isn't undone by the next fetch.
const recordedGameIds = new Set<string>();

const recordScore = (visitorId: string, displayName: string, game: WordHuntGame) => {
  if (recordedGameIds.has(game.gameId)) return;
  recordedGameIds.add(game.gameId);
  const date = getBoardDate();
  if (game.board.date !== date || game.score <= 0) return;
  if (leaderboard.date !== date) {
    leaderboard.date = date;
    leaderboard.scores.clear();
  }
  if ((leaderboard.scores.get(visitorId)?.score ?? 0) < game.score) {
    leaderboard.scores.set(visitorId, { name: displayName, score: game.score });
  }
};

const getLeaderboard = (visitorId: string) => {
  const date = getBoardDate();
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

// Same rule as getValidWordsForGame in gameState.ts (which the mock can't import, since it loads the Topia SDK).
const getValidWords = (game: WordHuntGame | undefined) =>
  game && !game.endedAt && Date.now() <= game.endsAt + SUBMISSION_GRACE_MS && game.board.date === getBoardDate()
    ? getDailyWordPoints()
    : undefined;

const finalizeIfExpired = (game: WordHuntGame | undefined) => {
  if (game && !game.endedAt && Date.now() > game.endsAt + SUBMISSION_GRACE_MS) {
    game.endedAt = game.endsAt;
    game.endReason = "timeout";
  }
};

const server = http.createServer((req, res) => {
  let rawBody = "";
  req.on("data", (chunk) => (rawBody += chunk));
  req.on("end", () => {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);
    const visitorId = url.searchParams.get("visitorId") || "local";
    const displayName = url.searchParams.get("displayName") || `Player ${visitorId}`;
    const body = rawBody ? JSON.parse(rawBody) : {};
    const board = getDailyBoard();
    let game = games.get(visitorId);
    const ok = (data: object) => sendJson(res, 200, { success: true, data: { ...data, serverTime: Date.now() } });

    switch (`${req.method} ${url.pathname}`) {
      case "GET /api/wordhunt/game-state":
        finalizeIfExpired(game);
        return ok({
          board,
          game: game || null,
          wordOfTheDay: getRevealedWordOfTheDay(game || null),
          validWords: getValidWords(game),
          isAdmin: IS_ADMIN,
        });

      case "POST /api/wordhunt/admin/clear-leaderboard":
        if (!IS_ADMIN) return sendJson(res, 403, { success: false, error: "Only world admins can do that." });
        leaderboard.scores.clear();
        return ok(getLeaderboard(visitorId));

      case "GET /api/wordhunt/admin/analytics": {
        if (!IS_ADMIN) return sendJson(res, 403, { success: false, error: "Only world admins can do that." });
        const requested = Number(url.searchParams.get("days"));
        const days = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_ANALYTICS_DAYS) : 7;
        return ok(buildAnalyticsResponse(analytics, getBoardDate(), days));
      }

      case "POST /api/wordhunt/admin/reset-play":
        if (!IS_ADMIN) return sendJson(res, 403, { success: false, error: "Only world admins can do that." });
        games.delete(visitorId);
        replayDates.set(visitorId, board.date);
        return ok({ board, game: null, isAdmin: true });

      case "GET /api/wordhunt/leaderboard":
        finalizeIfExpired(game);
        if (game?.endedAt) recordScore(visitorId, displayName, game);
        return ok(getLeaderboard(visitorId));

      case "GET /api/wordhunt/badges":
        return ok({ badges: buildBadgeList(allStats.get(visitorId)) });

      case "POST /api/wordhunt/start": {
        const isActive = game && !game.endedAt && Date.now() <= game.endsAt + SUBMISSION_GRACE_MS;
        // One game per daily board: a finished game on today's board is returned instead of starting a new one.
        if (game && game.board.date === board.date && !isActive) {
          finalizeIfExpired(game);
          return ok({ board, game, wordOfTheDay: getRevealedWordOfTheDay(game) });
        }
        if (!isActive) {
          const now = Date.now();
          game = {
            ...(replayDates.get(visitorId) === board.date && { isReplay: true }),
            gameId: randomUUID(),
            board,
            startedAt: now,
            endsAt: now + GAME_DURATION,
            endedAt: null,
            endReason: null,
            score: 0,
            foundWords: [],
          };
          games.set(visitorId, game);
          if (!game.isReplay) addToAnalytics(game.board.date, { gamesStarted: 1 });
        }
        return ok({ board, game, validWords: getValidWords(game) });
      }

      case "POST /api/wordhunt/submit-word": {
        if (!game || game.gameId !== body.gameId) return sendJson(res, 400, { success: false, error: "No game" });
        const respond = (result: WordHuntSubmitResult, word = "", points = 0) => ok({ result, word, points, game });

        finalizeIfExpired(game);
        if (game.endedAt) return respond("game_over");
        const word = getWordFromPath(game.board, body.path);
        if (word === null) return respond("invalid_path");
        if (word.length < MIN_WORD_LENGTH) return respond("too_short", word);
        if (game.foundWords.some((found) => found.word === word)) return respond("already_found", word);
        if (!isValidWord(word)) return respond("not_a_word", word);

        const points = getPointsForWord(word);
        game.foundWords.push({ word, points });
        game.score += points;
        return respond("valid", word, points);
      }

      case "POST /api/wordhunt/end": {
        if (!game || game.gameId !== body.gameId) return sendJson(res, 400, { success: false, error: "No game" });
        let newBadges: string[] = [];
        if (!game.endedAt) {
          const now = Date.now();
          game.endedAt = Math.min(now, game.endsAt);
          game.endReason = now >= game.endsAt - 2000 ? "timeout" : "quit";
          newBadges = recordFinish(visitorId, game);
          recordFinishAnalytics(game);
          recordScore(visitorId, displayName, game);
        }
        return ok({ board, game, newBadges, wordOfTheDay: getRevealedWordOfTheDay(game) });
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
