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
 *
 * Then run the client (`npm run dev` in client/) and open:
 *   http://localhost:3001/?assetId=local&interactiveNonce=local&interactivePublicKey=local&urlSlug=local&visitorId=1&sceneDropId=local&profileId=local
 */
import http from "http";
import { randomUUID } from "crypto";
import { WordHuntGame, WordHuntStats, WordHuntSubmitResult } from "@shared/types/wordhunt/WordHuntTypes.js";
import { buildBadgeList, getNewBadgeNames, recordFinishedGame } from "../utils/badges.js";
import { getBoardDate, getDailyBoard, getWordFromPath } from "../utils/board.js";
import { getPointsForWord, GAME_DURATION_MS, LEADERBOARD_SIZE, MIN_WORD_LENGTH, SUBMISSION_GRACE_MS } from "../utils/constants.js";
import { isValidWord } from "../utils/dictionary.js";

const PORT = 3000;
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

const recordScore = (visitorId: string, displayName: string, game: WordHuntGame) => {
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

const sendJson = (res: http.ServerResponse, status: number, body: object) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

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
        return ok({ board, game: game || null });

      case "GET /api/wordhunt/leaderboard":
        finalizeIfExpired(game);
        if (game?.endedAt) recordScore(visitorId, displayName, game);
        return ok(getLeaderboard(visitorId));

      case "GET /api/wordhunt/badges":
        return ok({ badges: buildBadgeList(allStats.get(visitorId)) });

      case "POST /api/wordhunt/start": {
        const isActive = game && !game.endedAt && Date.now() <= game.endsAt + SUBMISSION_GRACE_MS;
        if (!isActive) {
          const now = Date.now();
          game = {
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
        }
        return ok({ board, game });
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
          recordScore(visitorId, displayName, game);
        }
        return ok({ board, game, newBadges });
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
