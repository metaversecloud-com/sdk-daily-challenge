import express from "express";
import request from "supertest";

import router from "../../routes.js";
import { areAdjacent, findAllWords, getBoardDate, getDailyBoard, getWordFromPath } from "../../wordhunt/utils/board.js";
import { getPointsForWord } from "../../wordhunt/utils/constants.js";
import { isBlockedWord, isValidWord } from "../../wordhunt/utils/dictionary.js";
import { getWordOfTheDay } from "../../wordhunt/utils/wordOfTheDay.js";
import { clearGameCache, fromStoredGame, toStoredGame } from "../../wordhunt/utils/gameState.js";

jest.mock("@utils/index.js", () => ({
  errorHandler: jest.fn(({ error, res }: any) => res?.status(500).json({ success: false, error: String(error) })),
  getCredentials: jest.fn((query: any) => ({ ...query, visitorId: Number(query.visitorId) })),
  // Used by the shared /game-state controller
  getDroppedAsset: jest.fn().mockResolvedValue({ position: { x: 0, y: 0 } }),
  getVisitor: (...args: any[]) => require("@utils/getVisitor.js").getVisitor(...args),
  World: { create: jest.fn(() => ({ triggerParticle: jest.fn().mockResolvedValue({}) })) },
}));

// Granting badges needs the Topia ecosystem inventory; which badges are earned is covered by badges.test.ts.
jest.mock("../../wordhunt/utils/grantBadges.js", () => ({ grantBadges: jest.fn() }));

// The visitor the fast submit path saves with (Visitor.create makes no request to Topia), and the dropped asset
// the analytics counters are added to (DroppedAsset.create also makes no request).
let mockVisitorForSave: any;
const mockAnalyticsAsset = { incrementDataObjectValue: jest.fn().mockResolvedValue({}) };
jest.mock("@utils/topiaInit.js", () => ({
  Visitor: { create: jest.fn(() => mockVisitorForSave) },
  DroppedAsset: { create: jest.fn(() => mockAnalyticsAsset) },
}));

jest.mock("@utils/getVisitor.js", () => ({
  getVisitor: jest.fn(),
}));

jest.mock("@utils/droppedAssets/getDroppedAsset.js", () => ({
  getDroppedAsset: jest.fn(),
}));

const { getVisitor: mockGetVisitor } = jest.mocked(require("@utils/getVisitor.js"));
const { getDroppedAsset: mockGetDroppedAsset } = jest.mocked(require("@utils/droppedAssets/getDroppedAsset.js"));

const baseCreds = {
  assetId: "asset-123",
  interactivePublicKey: "public-key",
  interactiveNonce: "nonce-xyz",
  sceneDropId: "scene-1",
  visitorId: 1,
  urlSlug: "my-world",
};
const DATA_KEY = "my-world-scene-1";

// Row-major 5x5 test board:
//   C A T S E
//   B C D F G
//   ...
const TEST_TILES = ["C", "A", "T", "S", "E", "B", "C", "D", "F", "G", ...Array(15).fill("Z")];
const testBoard = { date: "2026-01-01", size: 5, tiles: TEST_TILES };

const makeGame = (overrides: object = {}) => ({
  gameId: "game-1",
  board: testBoard,
  startedAt: Date.now() - 10_000,
  endsAt: Date.now() + 110_000,
  endedAt: null,
  endReason: null,
  score: 0,
  foundWords: [],
  ...overrides,
});

const mockVisitorWithGame = (game: object | null, { isAdmin = false, replayDate = "" } = {}) => {
  const wordhunt = { ...(game && { game }), ...(replayDate && { replayDate }) };
  const visitor = {
    isAdmin,
    dataObject: { [DATA_KEY]: { dateStarted: 1, ...(Object.keys(wordhunt).length ? { wordhunt } : {}) } },
    fetchDataObject: jest.fn(),
    updateDataObject: jest.fn().mockResolvedValue({}),
  };
  mockGetVisitor.mockResolvedValue({ visitor, visitorInventory: {} });
  mockVisitorForSave = visitor;
  return visitor;
};

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  return app;
};

describe("wordhunt utils", () => {
  test("scores words by length", () => {
    expect(getPointsForWord("ca")).toBe(0);
    expect(getPointsForWord("cat")).toBe(200);
    expect(getPointsForWord("cats")).toBe(400);
    expect(getPointsForWord("catsx")).toBe(800);
    expect(getPointsForWord("abcdef")).toBe(1000);
    expect(getPointsForWord("abcdefg")).toBe(1200);
    expect(getPointsForWord("abcdefgh")).toBe(1400);
    expect(getPointsForWord("abcdefghijk")).toBe(1400);
  });

  test("detects adjacency including diagonals", () => {
    expect(areAdjacent(0, 1)).toBe(true);
    expect(areAdjacent(0, 6)).toBe(true);
    expect(areAdjacent(0, 5)).toBe(true);
    expect(areAdjacent(0, 2)).toBe(false);
    expect(areAdjacent(4, 5)).toBe(false); // end of row 0 does not wrap to start of row 1
    expect(areAdjacent(3, 3)).toBe(false);
  });

  test("derives words only from valid paths", () => {
    expect(getWordFromPath(testBoard, [0, 1, 2])).toBe("cat");
    expect(getWordFromPath(testBoard, [0, 2])).toBeNull(); // not adjacent
    expect(getWordFromPath(testBoard, [0, 1, 0])).toBeNull(); // tile reused
    expect(getWordFromPath(testBoard, [0, 99])).toBeNull(); // out of bounds
    expect(getWordFromPath(testBoard, "cat")).toBeNull();
    expect(getWordFromPath(testBoard, [])).toBeNull();
    expect(getWordFromPath({ ...testBoard, tiles: ["Qu", "I", "T", ...TEST_TILES.slice(3)] }, [0, 1, 2])).toBe("quit");
  });

  test("uses the ENABLE word list with inappropriate words removed", () => {
    expect(isValidWord("cat")).toBe(true);
    expect(isValidWord("spicy")).toBe(true);
    expect(isValidWord("assist")).toBe(true);
    expect(isValidWord("bcd")).toBe(false);
    expect(isValidWord("damn")).toBe(false);
    expect(isBlockedWord("bitches")).toBe(true);
    expect(isBlockedWord("wristwatch")).toBe(false);
  });

  test("generates the same playable board for everyone on a given day", () => {
    const board = getDailyBoard("2026-10-13");
    expect(board.tiles).toHaveLength(25);
    expect(getDailyBoard("2026-10-13").tiles).toEqual(board.tiles);
    expect(getDailyBoard("2026-10-14").tiles).not.toEqual(board.tiles);
    expect(findAllWords(board.tiles).size).toBeGreaterThan(100);
    expect(getBoardDate(new Date("2026-10-13T20:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("wordhunt saved game format", () => {
  test("loads games saved before found words were a map, merging both formats", () => {
    const game = fromStoredGame({
      ...makeGame(),
      foundWords: [{ word: "cat", points: 200 }],
      score: 200,
      found: { cats: 400, cat: 200 },
    } as any);
    expect(game.foundWords).toEqual([
      { word: "cat", points: 200 },
      { word: "cats", points: 400 },
    ]);
    expect(game.score).toBe(600);
  });

  test("round-trips through the saved format", () => {
    const game = makeGame({ foundWords: [{ word: "cat", points: 200 }], score: 200 }) as any;
    expect(fromStoredGame(toStoredGame(game))).toEqual(game);
  });
});

describe("wordhunt routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGameCache();
  });

  test("GET /wordhunt/game-state returns today's board and no game for a new player", async () => {
    mockVisitorWithGame(null);
    const res = await request(makeApp()).get("/api/wordhunt/game-state").query(baseCreds);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.board.tiles).toHaveLength(25);
    expect(res.body.data.game).toBeNull();
    // Loads visitor details so the response can say whether the player is a world admin.
    expect(mockGetVisitor).toHaveBeenCalledWith(expect.objectContaining({ urlSlug: "my-world", visitorId: 1 }), true, {
      includeInventory: false,
    });
    expect(res.body.data.isAdmin).toBe(false);
  });

  test("GET /wordhunt/game-state tells world admins they're admins", async () => {
    mockVisitorWithGame(null, { isAdmin: true });
    const res = await request(makeApp()).get("/api/wordhunt/game-state").query(baseCreds);
    expect(res.body.data.isAdmin).toBe(true);
  });

  test("GET /wordhunt/game-state finalizes a game whose timer ran out", async () => {
    const visitor = mockVisitorWithGame(makeGame({ endsAt: Date.now() - 60_000 }));
    const res = await request(makeApp()).get("/api/wordhunt/game-state").query(baseCreds);

    expect(res.body.data.game.endReason).toBe("timeout");
    expect(visitor.updateDataObject).toHaveBeenCalledWith(
      {
        [`${DATA_KEY}.wordhunt.game`]: expect.objectContaining({ endReason: "timeout" }),
        [`${DATA_KEY}.wordhunt.stats`]: expect.objectContaining({ gamesPlayed: 1 }),
      },
      { analytics: expect.arrayContaining([expect.objectContaining({ analyticName: "completions" })]) },
    );
  });

  test("POST /wordhunt/start creates a 2 minute game and saves it on the visitor", async () => {
    const visitor = mockVisitorWithGame(null);
    const res = await request(makeApp()).post("/api/wordhunt/start").query(baseCreds);

    const { game } = res.body.data;
    expect(res.status).toBe(200);
    expect(game.score).toBe(0);
    expect(game.foundWords).toEqual([]);
    expect(game.endsAt - game.startedAt).toBe(120_000);
    expect(game.board.tiles).toEqual(res.body.data.board.tiles);
    expect(visitor.updateDataObject).toHaveBeenCalledWith(
      { [`${DATA_KEY}.wordhunt.game`]: toStoredGame(game) },
      { analytics: [expect.objectContaining({ analyticName: "starts", uniqueKey: expect.stringContaining(game.gameId) })] },
    );
    // Saved with found words as a map, so each word can be saved on its own.
    expect(visitor.updateDataObject.mock.calls[0][0][`${DATA_KEY}.wordhunt.game`].found).toEqual({});
  });

  test("POST /wordhunt/start sends today's words and points so the client can check words instantly", async () => {
    mockVisitorWithGame(null);
    const res = await request(makeApp()).post("/api/wordhunt/start").query(baseCreds);

    const words = findAllWords(getDailyBoard().tiles);
    expect(Object.keys(res.body.data.validWords).sort()).toEqual([...words].sort());
    const [word] = words;
    expect(res.body.data.validWords[word]).toBe(getPointsForWord(word));
  });

  test("GET /wordhunt/game-state only sends today's words while the game is in progress", async () => {
    const today = { ...testBoard, date: getBoardDate() };
    mockVisitorWithGame(makeGame({ board: today }));
    const during = await request(makeApp()).get("/api/wordhunt/game-state").query(baseCreds);
    expect(during.body.data.validWords).toBeDefined();

    clearGameCache();
    mockVisitorWithGame(makeGame({ board: today, endedAt: Date.now(), endReason: "quit" }));
    const after = await request(makeApp()).get("/api/wordhunt/game-state").query(baseCreds);
    expect(after.body.data).not.toHaveProperty("validWords");
  });

  test("POST /wordhunt/start returns today's finished game instead of starting another", async () => {
    const finishedGame = makeGame({
      board: { ...testBoard, date: getBoardDate() },
      endsAt: Date.now() - 60_000,
      endedAt: Date.now() - 60_000,
      endReason: "timeout",
      score: 600,
      foundWords: [
        { word: "cats", points: 400 },
        { word: "cat", points: 200 },
      ],
    });
    const visitor = mockVisitorWithGame(finishedGame);
    const res = await request(makeApp()).post("/api/wordhunt/start").query(baseCreds);

    expect(res.status).toBe(200);
    expect(res.body.data.game).toEqual(finishedGame);
    expect(visitor.updateDataObject).not.toHaveBeenCalled();
  });

  test("GET /game-state?game=wordhunt (what the client calls) includes the word of the day once today's game ended", async () => {
    mockVisitorWithGame(makeGame({ board: { ...testBoard, date: getBoardDate() }, endedAt: Date.now(), endReason: "quit" }));
    const res = await request(makeApp()).get("/api/game-state").query({ ...baseCreds, game: "wordhunt" });

    expect(res.status).toBe(200);
    expect(res.body.data.wordOfTheDay).toEqual(getWordOfTheDay());
  });

  test("POST /wordhunt/end reveals the word of the day, but game-state hides it during the game", async () => {
    const todaysGame = makeGame({ board: { ...testBoard, date: getBoardDate() } });
    mockVisitorWithGame(todaysGame);
    const during = await request(makeApp()).get("/api/wordhunt/game-state").query(baseCreds);
    expect(during.body.data).not.toHaveProperty("wordOfTheDay");

    const ended = await request(makeApp()).post("/api/wordhunt/end").query(baseCreds).send({ gameId: "game-1" });
    expect(ended.body.data.wordOfTheDay).toEqual(getWordOfTheDay());
    expect(ended.body.data.wordOfTheDay.word.length).toBeGreaterThan(0);
  });

  test("POST /wordhunt/start finishes today's expired game and returns it instead of starting another", async () => {
    const visitor = mockVisitorWithGame(
      makeGame({ board: { ...testBoard, date: getBoardDate() }, endsAt: Date.now() - 60_000 }),
    );
    const res = await request(makeApp()).post("/api/wordhunt/start").query(baseCreds);

    expect(res.body.data.game).toMatchObject({ gameId: "game-1", endReason: "timeout" });
    expect(visitor.updateDataObject).toHaveBeenCalledWith(
      {
        [`${DATA_KEY}.wordhunt.game`]: expect.objectContaining({ gameId: "game-1", endReason: "timeout" }),
        [`${DATA_KEY}.wordhunt.stats`]: expect.objectContaining({ gamesPlayed: 1 }),
      },
      { analytics: expect.arrayContaining([expect.objectContaining({ analyticName: "completions" })]) },
    );
  });

  test("POST /wordhunt/start starts a new game when the last one was on an earlier day", async () => {
    const visitor = mockVisitorWithGame(makeGame({ endedAt: Date.now() - 60_000, endReason: "timeout" }));
    const res = await request(makeApp()).post("/api/wordhunt/start").query(baseCreds);

    expect(res.body.data.game.gameId).not.toBe("game-1");
    expect(res.body.data.game.endedAt).toBeNull();
    expect(visitor.updateDataObject).toHaveBeenCalledWith(
      { [`${DATA_KEY}.wordhunt.game`]: toStoredGame(res.body.data.game) },
      { analytics: [expect.objectContaining({ analyticName: "starts" })] },
    );
  });

  test("POST /wordhunt/submit-word awards points for a valid word", async () => {
    const visitor = mockVisitorWithGame(makeGame());
    const res = await request(makeApp())
      .post("/api/wordhunt/submit-word")
      .query(baseCreds)
      .send({ gameId: "game-1", path: [0, 1, 2] });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ result: "valid", word: "cat", points: 200 });
    expect(res.body.data.game.score).toBe(200);
    expect(res.body.data.game.foundWords).toEqual([{ word: "cat", points: 200 }]);
    // Only the new word is written.
    expect(visitor.updateDataObject).toHaveBeenCalledTimes(1);
    expect(visitor.updateDataObject).toHaveBeenCalledWith({ [`${DATA_KEY}.wordhunt.game.found.cat`]: 200 }, {});
  });

  test("POST /wordhunt/submit-word skips loading the game after the first word (one Topia request per word)", async () => {
    const visitor = mockVisitorWithGame(makeGame());
    const app = makeApp();
    await request(app).post("/api/wordhunt/submit-word").query(baseCreds).send({ gameId: "game-1", path: [0, 1, 2] });
    const second = await request(app)
      .post("/api/wordhunt/submit-word")
      .query(baseCreds)
      .send({ gameId: "game-1", path: [0, 1, 2, 3] });

    expect(second.body.data).toMatchObject({ result: "valid", word: "cats" });
    expect(mockGetVisitor).toHaveBeenCalledTimes(1);
    expect(visitor.fetchDataObject).not.toHaveBeenCalled();
    expect(visitor.updateDataObject).toHaveBeenCalledTimes(2);
  });

  test("POST /wordhunt/submit-word handles words sent at the same time without losing any", async () => {
    const visitor = mockVisitorWithGame(makeGame());
    const app = makeApp();
    // Load the game once, then send three words in parallel (one of them twice).
    await request(app).get("/api/wordhunt/game-state").query(baseCreds);
    const send = (path: number[]) =>
      request(app).post("/api/wordhunt/submit-word").query(baseCreds).send({ gameId: "game-1", path });
    const results = await Promise.all([send([0, 1, 2]), send([0, 1, 2, 3]), send([0, 1, 2])]);

    expect(results.map((res) => res.body.data.result).sort()).toEqual(["already_found", "valid", "valid"]);
    const saved = visitor.updateDataObject.mock.calls.map(([update]: any[]) => Object.keys(update)[0]).sort();
    expect(saved).toEqual([`${DATA_KEY}.wordhunt.game.found.cat`, `${DATA_KEY}.wordhunt.game.found.cats`]);
  });

  test("POST /wordhunt/submit-word puts the word back if saving it fails", async () => {
    const visitor = mockVisitorWithGame(makeGame());
    visitor.updateDataObject.mockRejectedValueOnce(new Error("Topia unavailable"));
    const app = makeApp();
    const failed = await request(app)
      .post("/api/wordhunt/submit-word")
      .query(baseCreds)
      .send({ gameId: "game-1", path: [0, 1, 2] });
    expect(failed.status).toBe(500);

    const retry = await request(app).post("/api/wordhunt/submit-word").query(baseCreds).send({ gameId: "game-1", path: [0, 1, 2] });
    expect(retry.body.data).toMatchObject({ result: "valid", word: "cat" });
    expect(retry.body.data.game.score).toBe(200);
  });

  test.each([
    ["not_a_word", [5, 6, 7], []],
    ["too_short", [0, 1], []],
    ["invalid_path", [0, 2, 3], []],
    ["already_found", [0, 1, 2], [{ word: "cat", points: 200 }]],
  ])("POST /wordhunt/submit-word rejects %s without saving", async (result, path, foundWords) => {
    const visitor = mockVisitorWithGame(makeGame({ foundWords, score: 200 * foundWords.length }));
    const res = await request(makeApp())
      .post("/api/wordhunt/submit-word")
      .query(baseCreds)
      .send({ gameId: "game-1", path });

    expect(res.body.data.result).toBe(result);
    expect(res.body.data.points).toBe(0);
    expect(visitor.updateDataObject).not.toHaveBeenCalled();
  });

  test("POST /wordhunt/submit-word accepts TOPIA when it's on the board", async () => {
    const topiaBoard = { ...testBoard, tiles: ["T", "O", "P", "I", "A", ...TEST_TILES.slice(5)] };
    mockVisitorWithGame(makeGame({ board: topiaBoard }));
    const res = await request(makeApp())
      .post("/api/wordhunt/submit-word")
      .query(baseCreds)
      .send({ gameId: "game-1", path: [0, 1, 2, 3, 4] });

    expect(res.body.data).toMatchObject({ result: "valid", word: "topia", points: 800 });
  });

  test("POST /wordhunt/submit-word rejects words after the timer ends", async () => {
    mockVisitorWithGame(makeGame({ endsAt: Date.now() - 60_000 }));
    const res = await request(makeApp())
      .post("/api/wordhunt/submit-word")
      .query(baseCreds)
      .send({ gameId: "game-1", path: [0, 1, 2] });

    expect(res.body.data.result).toBe("game_over");
    expect(res.body.data.game.score).toBe(0);
  });

  test("POST /wordhunt/submit-word returns 400 for an unknown game", async () => {
    mockVisitorWithGame(makeGame());
    const res = await request(makeApp())
      .post("/api/wordhunt/submit-word")
      .query(baseCreds)
      .send({ gameId: "other-game", path: [0, 1, 2] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("POST /wordhunt/end lets the player quit early and keeps their words", async () => {
    const foundWords = [{ word: "cat", points: 200 }];
    const visitor = mockVisitorWithGame(makeGame({ foundWords, score: 200 }));
    const res = await request(makeApp()).post("/api/wordhunt/end").query(baseCreds).send({ gameId: "game-1" });

    expect(res.body.data.game).toMatchObject({ endReason: "quit", score: 200, foundWords });
    expect(res.body.data.game.endedAt).not.toBeNull();
    expect(visitor.updateDataObject).toHaveBeenCalledTimes(1);
  });

  test("POST /wordhunt/end awards CROWN! when the player finishes at the top of today's leaderboard", async () => {
    const foundWords = [{ word: "planet", points: 1000 }];
    const visitor = mockVisitorWithGame(makeGame({ board: { ...testBoard, date: getBoardDate() }, foundWords }));
    // Today's leaderboard already has this player's 1,000 on top (as recorded when the game ends).
    mockGetDroppedAsset.mockResolvedValue({
      dataObject: { dailyLeaderboard: { date: getBoardDate(), scores: { p1: "Ann|1000", p2: "Bob|600" } } },
      updateDataObject: jest.fn().mockResolvedValue({}),
    });
    const res = await request(makeApp())
      .post("/api/wordhunt/end")
      .query({ ...baseCreds, profileId: "p1", displayName: "Ann" })
      .send({ gameId: "game-1" });

    expect(res.body.data.newBadges).toContain("CROWN!");
    expect(visitor.updateDataObject).toHaveBeenCalledWith(
      expect.objectContaining({ [`${DATA_KEY}.wordhunt.stats`]: expect.objectContaining({ wonCrown: true }) }),
      // The crown is decided before the save, so it's also in the analytics recorded with it.
      {
        analytics: expect.arrayContaining([
          expect.objectContaining({ analyticName: "badgesAwarded", uniqueKey: "p1-CROWN!" }),
        ]),
      },
    );
  });

  test("POST /wordhunt/end does not award CROWN! below the top score", async () => {
    const foundWords = [
      { word: "cats", points: 400 },
      { word: "cat", points: 200 },
    ];
    mockVisitorWithGame(makeGame({ board: { ...testBoard, date: getBoardDate() }, foundWords }));
    mockGetDroppedAsset.mockResolvedValue({
      dataObject: { dailyLeaderboard: { date: getBoardDate(), scores: { p1: "Ann|600", p2: "Bob|900" } } },
      updateDataObject: jest.fn().mockResolvedValue({}),
    });
    const res = await request(makeApp())
      .post("/api/wordhunt/end")
      .query({ ...baseCreds, profileId: "p1", displayName: "Ann" })
      .send({ gameId: "game-1" });

    expect(res.body.data.newBadges).not.toContain("CROWN!");
  });
});

describe("wordhunt admin tools", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGameCache();
  });

  const mockAsset = () => {
    const asset = {
      dataObject: { dailyLeaderboard: { date: getBoardDate(), scores: { p1: "Ann|1000", p2: "Bob|600" } } },
      updateDataObject: jest.fn().mockResolvedValue({}),
    };
    mockGetDroppedAsset.mockResolvedValue(asset);
    return asset;
  };

  test.each(["clear-leaderboard", "reset-play"])("POST /wordhunt/admin/%s is refused for non-admins", async (action) => {
    const visitor = mockVisitorWithGame(makeGame());
    const asset = mockAsset();
    const res = await request(makeApp()).post(`/api/wordhunt/admin/${action}`).query(baseCreds);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, error: "Only world admins can do that." });
    expect(visitor.updateDataObject).not.toHaveBeenCalled();
    expect(asset.updateDataObject).not.toHaveBeenCalled();
  });

  test("POST /wordhunt/admin/clear-leaderboard empties today's leaderboard", async () => {
    mockVisitorWithGame(null, { isAdmin: true });
    const asset = mockAsset();
    const res = await request(makeApp()).post("/api/wordhunt/admin/clear-leaderboard").query(baseCreds);

    expect(res.status).toBe(200);
    // Both modes' leaderboards.
    const empty = { date: getBoardDate(), scores: {} };
    expect(asset.updateDataObject).toHaveBeenCalledWith({ dailyLeaderboard: empty, goldenDailyLeaderboard: empty }, {});
    // Admin status is checked with Topia (Visitor.get), not taken from the request.
    expect(mockGetVisitor).toHaveBeenCalledWith(expect.anything(), true, { includeInventory: false });
  });

  test("POST /wordhunt/admin/reset-play deletes only the admin's game for today", async () => {
    const finished = makeGame({
      board: { ...testBoard, date: getBoardDate() },
      endedAt: Date.now(),
      endReason: "quit",
      foundWords: [{ word: "cat", points: 200 }],
    });
    const visitor = mockVisitorWithGame(finished, { isAdmin: true });
    const res = await request(makeApp()).post("/api/wordhunt/admin/reset-play").query(baseCreds);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ game: null, isAdmin: true });
    // Only the game is cleared (lifetime stats and badges are left alone), and today is marked so the admin's
    // next games on this board are replays.
    expect(visitor.updateDataObject).toHaveBeenCalledTimes(1);
    expect(visitor.updateDataObject).toHaveBeenCalledWith(
      {
        [`${DATA_KEY}.wordhunt.game`]: null,
        [`${DATA_KEY}.wordhunt.replayDate`]: getBoardDate(),
        // Golden mode's game too.
        [`${DATA_KEY}.wordhunt.golden.game`]: null,
        [`${DATA_KEY}.wordhunt.golden.replayDate`]: getBoardDate(),
      },
      {},
    );
  });

  test("POST /wordhunt/admin/reset-play stops the old game from accepting more words", async () => {
    mockVisitorWithGame(makeGame(), { isAdmin: true });
    const app = makeApp();
    // Puts the game in the server's in-memory cache.
    await request(app).post("/api/wordhunt/submit-word").query(baseCreds).send({ gameId: "game-1", path: [0, 1, 2] });

    await request(app).post("/api/wordhunt/admin/reset-play").query(baseCreds);
    mockVisitorWithGame(null, { isAdmin: true }); // the saved game is gone now
    const res = await request(app)
      .post("/api/wordhunt/submit-word")
      .query(baseCreds)
      .send({ gameId: "game-1", path: [0, 1, 2, 3] });

    expect(res.status).toBe(400);
  });
});

describe("wordhunt analytics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGameCache();
  });

  // Recording runs in the background, so let it finish before checking.
  const flushBackgroundWork = () => new Promise((resolve) => setImmediate(resolve));
  const incrementedCounters = () =>
    Object.fromEntries(mockAnalyticsAsset.incrementDataObjectValue.mock.calls.map(([path, amount]: any[]) => [path, amount]));

  test("starting a game counts it for today's board", async () => {
    mockVisitorWithGame(null);
    await request(makeApp()).post("/api/wordhunt/start").query(baseCreds);
    await flushBackgroundWork();

    expect(incrementedCounters()).toEqual({ [`wordHuntAnalytics.${getBoardDate()}.gamesStarted`]: 1 });
  });

  test("ending a game records the Topia events with the save, and the day's counters", async () => {
    const foundWords = [
      { word: "planets", points: 1200 },
      { word: "cat", points: 200 },
    ];
    const startedAt = Date.now() - 45_000;
    const visitor = mockVisitorWithGame(makeGame({ board: { ...testBoard, date: "2026-01-01" }, startedAt, foundWords }));
    await request(makeApp())
      .post("/api/wordhunt/end")
      .query({ ...baseCreds, profileId: "p1" })
      .send({ gameId: "game-1" });
    await flushBackgroundWork();

    const [, options] = visitor.updateDataObject.mock.calls[0];
    const events = Object.fromEntries(options.analytics.map((event: any) => [event.analyticName, event]));
    expect(events.completions).toMatchObject({ profileId: "p1", urlSlug: "my-world", uniqueKey: "p1-game-1" });
    expect(events.quits).toBeDefined();
    expect(events.wordsFound).toMatchObject({ incrementBy: 2 });
    expect(events.pointsScored).toMatchObject({ incrementBy: 1400 });
    expect(events.longWordsFound).toMatchObject({ incrementBy: 1 });
    // One "badgesAwarded" per new badge: the first game, and a 7+ letter word.
    const badgeKeys = options.analytics.filter((event: any) => event.analyticName === "badgesAwarded").map((event: any) => event.uniqueKey);
    expect(badgeKeys.sort()).toEqual(["p1-Amateur Hunter", "p1-Big Word Hunter"]);

    const counters = incrementedCounters();
    const day = "wordHuntAnalytics.2026-01-01";
    expect(counters).toMatchObject({
      [`${day}.gamesCompleted`]: 1,
      [`${day}.gamesQuit`]: 1,
      [`${day}.wordsFound`]: 2,
      [`${day}.pointsScored`]: 1400,
      [`${day}.longWordsFound`]: 1,
    });
    expect(counters[`${day}.secondsPlayed`]).toBeGreaterThanOrEqual(45);
  });

  test("a counter that fails to save never fails the player's request", async () => {
    mockVisitorWithGame(null);
    mockAnalyticsAsset.incrementDataObjectValue.mockRejectedValueOnce(new Error("Topia unavailable"));
    const res = await request(makeApp()).post("/api/wordhunt/start").query(baseCreds);
    await flushBackgroundWork();

    expect(res.status).toBe(200);
  });

  test("GET /wordhunt/admin/analytics is refused for non-admins", async () => {
    mockVisitorWithGame(null);
    const res = await request(makeApp()).get("/api/wordhunt/admin/analytics").query(baseCreds);
    expect(res.status).toBe(403);
  });

  test("GET /wordhunt/admin/analytics returns daily stats with rates and averages", async () => {
    mockVisitorWithGame(null, { isAdmin: true });
    const today = getBoardDate();
    mockGetDroppedAsset.mockResolvedValue({
      dataObject: {
        wordHuntAnalytics: { [today]: { gamesStarted: 4, gamesCompleted: 3, gamesTimedOut: 3, wordsFound: 30, pointsScored: 9000 } },
      },
    });
    const res = await request(makeApp()).get("/api/wordhunt/admin/analytics").query({ ...baseCreds, days: 3 });

    expect(res.status).toBe(200);
    expect(res.body.data.days).toHaveLength(3);
    expect(res.body.data.days[0]).toMatchObject({
      date: today,
      gamesStarted: 4,
      completionRate: 0.75,
      averageWordsFound: 10,
      averageScore: 3000,
    });
    expect(res.body.data.totals).toMatchObject({ gamesStarted: 4, gamesCompleted: 3 });
  });

  test("GET /wordhunt/admin/analytics defaults to 7 days and allows at most 90", async () => {
    mockVisitorWithGame(null, { isAdmin: true });
    mockGetDroppedAsset.mockResolvedValue({ dataObject: {} });
    const app = makeApp();
    const byDefault = await request(app).get("/api/wordhunt/admin/analytics").query(baseCreds);
    const tooMany = await request(app).get("/api/wordhunt/admin/analytics").query({ ...baseCreds, days: 1000 });

    expect(byDefault.body.data.days).toHaveLength(7);
    expect(tooMany.body.data.days).toHaveLength(90);
  });

  test("an admin's replay after resetting their play isn't counted", async () => {
    const visitor = mockVisitorWithGame(null, { isAdmin: true, replayDate: getBoardDate() });
    const app = makeApp();
    const started = await request(app).post("/api/wordhunt/start").query(baseCreds);
    expect(started.body.data.game.isReplay).toBe(true);
    // Saved without a "starts" event.
    expect(visitor.updateDataObject).toHaveBeenCalledWith({ [`${DATA_KEY}.wordhunt.game`]: expect.anything() }, {});

    mockVisitorWithGame(started.body.data.game, { isAdmin: true, replayDate: getBoardDate() });
    const ended = await request(app).post("/api/wordhunt/end").query(baseCreds).send({ gameId: started.body.data.game.gameId });
    await flushBackgroundWork();

    expect(ended.body.data.game.endedAt).not.toBeNull();
    const [, options] = mockVisitorForSave.updateDataObject.mock.calls[0];
    expect(options).toEqual({});
    expect(mockAnalyticsAsset.incrementDataObjectValue).not.toHaveBeenCalled();
  });

  test("a reset on an earlier day doesn't make today's game a replay", async () => {
    mockVisitorWithGame(null, { isAdmin: true, replayDate: "2020-01-01" });
    const res = await request(makeApp()).post("/api/wordhunt/start").query(baseCreds);
    await flushBackgroundWork();

    expect(res.body.data.game.isReplay).toBeUndefined();
    expect(incrementedCounters()).toEqual({ [`wordHuntAnalytics.${getBoardDate()}.gamesStarted`]: 1 });
  });
});

describe("wordhunt golden letter mode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGameCache();
  });

  const flush = () => new Promise((resolve) => setImmediate(resolve));
  // Board row 0 is C A T S E and row 1 B C D F G, so "cat"/"cats" have the golden letter T and "cab" doesn't.
  const goldenBoard = { ...testBoard, goldenLetter: "t", goals: { bronze: 1000, silver: 2000, gold: 3000 } };
  const goldenGame = (overrides: object = {}) => makeGame({ mode: "golden", goldenStreak: 0, board: goldenBoard, ...overrides });
  // Golden data lives under `.wordhunt.golden` on the visitor data object.
  const mockGoldenVisitor = (game: object | null, extra: object = {}) => {
    const visitor = {
      isAdmin: false,
      dataObject: { [DATA_KEY]: { dateStarted: 1, wordhunt: { golden: { ...(game && { game }) }, ...extra } } },
      fetchDataObject: jest.fn(),
      updateDataObject: jest.fn().mockResolvedValue({}),
    };
    mockGetVisitor.mockResolvedValue({ visitor, visitorInventory: {} });
    mockVisitorForSave = visitor;
    return visitor;
  };
  const submit = (app: express.Express, path: number[]) =>
    request(app).post("/api/wordhunt/submit-word").query({ ...baseCreds, mode: "golden" }).send({ gameId: "game-1", path });

  test("an unknown mode is refused", async () => {
    mockVisitorWithGame(null);
    const res = await request(makeApp()).post("/api/wordhunt/start").query({ ...baseCreds, mode: "turbo" });
    expect(res.status).toBe(400);
  });

  test("starting a golden game uses the golden board and saves it separately from classic", async () => {
    const visitor = mockGoldenVisitor(null);
    const res = await request(makeApp()).post("/api/wordhunt/start").query({ ...baseCreds, mode: "golden" });
    await flush();

    const { game, board, mode, modes } = res.body.data;
    expect(mode).toBe("golden");
    expect(game).toMatchObject({ mode: "golden", goldenStreak: 0 });
    expect(board.tiles).toEqual(getDailyBoard(undefined, "golden").tiles);
    expect(board.goldenLetter).toMatch(/^[a-z]$/);
    expect(modes).toEqual({ classic: "not_started", golden: "in_progress" });

    const [update, options] = visitor.updateDataObject.mock.calls[0];
    expect(Object.keys(update)).toEqual([`${DATA_KEY}.wordhunt.golden.game`]);
    // Counted in the shared "starts" (both modes) and in "goldenStarts".
    expect(options.analytics.map((event: any) => event.analyticName)).toEqual(["starts", "goldenStarts"]);
    expect(incrementedGolden()).toEqual({ [`wordHuntGoldenAnalytics.${getBoardDate()}.gamesStarted`]: 1 });
  });

  const incrementedGolden = () =>
    Object.fromEntries(mockAnalyticsAsset.incrementDataObjectValue.mock.calls.map(([path, amount]: any[]) => [path, amount]));

  test("golden words score double with a streak bonus; a non-golden word resets the streak", async () => {
    const visitor = mockGoldenVisitor(goldenGame());
    const app = makeApp();

    const first = await submit(app, [0, 1, 2]); // cat: 200 x 2
    const second = await submit(app, [0, 1, 2, 3]); // cats: 400 x 2.5 (second golden word in a row)
    const plain = await submit(app, [0, 1, 5]); // cab: no T, 200, streak resets

    expect(first.body.data).toMatchObject({ result: "valid", word: "cat", points: 400, multiplier: 2, goldenStreak: 1 });
    expect(second.body.data).toMatchObject({ points: 1000, multiplier: 2.5, goldenStreak: 2 });
    expect(plain.body.data).toMatchObject({ points: 200, multiplier: 1, goldenStreak: 0 });
    expect(plain.body.data.game.score).toBe(1600);

    // Each save writes just the word and the streak, under the golden game.
    expect(visitor.updateDataObject).toHaveBeenCalledWith(
      {
        [`${DATA_KEY}.wordhunt.golden.game.found.cats`]: 1000,
        [`${DATA_KEY}.wordhunt.golden.game.goldenStreak`]: 2,
        [`${DATA_KEY}.wordhunt.golden.game.goldenBestStreak`]: 2,
      },
      {},
    );
  });

  test("finishing a golden game only updates the golden bests, and uses the golden leaderboard", async () => {
    const foundWords = [{ word: "cats", points: 1000 }, { word: "cat", points: 400 }, { word: "cab", points: 200 }];
    const classicStats = { gamesPlayed: 3, totalScore: 900, bestScore: 500, streak: { current: 1, best: 2, lastDate: "2026-01-01" } };
    const visitor = mockGoldenVisitor(goldenGame({ board: { ...goldenBoard, date: getBoardDate() }, foundWords, goldenBestStreak: 2 }), {
      stats: classicStats,
    });
    const asset = { dataObject: {}, updateDataObject: jest.fn().mockResolvedValue({}) };
    mockGetDroppedAsset.mockResolvedValue(asset);

    const res = await request(makeApp())
      .post("/api/wordhunt/end")
      .query({ ...baseCreds, mode: "golden", profileId: "p1", displayName: "Ann" })
      .send({ gameId: "game-1" });
    await flush();

    expect(res.body.data.newBadges).toEqual([]);
    expect(res.body.data.modes.golden).toBe("finished");
    const [update, options] = visitor.updateDataObject.mock.calls[0];
    // Classic stats are untouched; only the golden bests are added.
    expect(update[`${DATA_KEY}.wordhunt.stats`]).toEqual({
      ...classicStats,
      foundTopia: false,
      foundLongWord: false,
      wonCrown: false,
      goldenBestStreak: 2,
      goldenMostWords: 2,
    });
    const events = options.analytics.map((event: any) => event.analyticName);
    // Shared events (counted with classic) plus golden copies and golden-only events.
    expect(events).toEqual(
      expect.arrayContaining(["completions", "goldenCompletions", "goldenLetterWordsFound", "goldenBronzeGoals"]),
    );

    expect(asset.updateDataObject).toHaveBeenCalledWith(
      { goldenDailyLeaderboard: { date: getBoardDate(), scores: { p1: "Ann|1600" } } },
      {},
    );
    const counters = incrementedGolden();
    const day = `wordHuntGoldenAnalytics.${getBoardDate()}`;
    expect(counters).toMatchObject({ [`${day}.gamesCompleted`]: 1, [`${day}.goldenLetterWordsFound`]: 2, [`${day}.goalsBronze`]: 1 });
  });

  test("GET /game-state reports both modes, so the start screen can show each one", async () => {
    const finishedClassic = makeGame({ board: { ...testBoard, date: getBoardDate() }, endedAt: Date.now(), endReason: "quit" });
    mockGoldenVisitor(goldenGame({ board: { ...goldenBoard, date: getBoardDate() } }), { game: finishedClassic });
    const res = await request(makeApp()).get("/api/wordhunt/game-state").query({ ...baseCreds, mode: "golden" });

    expect(res.body.data.modes).toEqual({ classic: "finished", golden: "in_progress" });
    expect(res.body.data.game.mode).toBe("golden");
  });

  test("each mode has its own leaderboard", async () => {
    mockVisitorWithGame(null);
    mockGetDroppedAsset.mockResolvedValue({
      dataObject: {
        dailyLeaderboard: { date: getBoardDate(), scores: { p1: "Ann|500" } },
        goldenDailyLeaderboard: { date: getBoardDate(), scores: { p2: "Bob|900" } },
      },
    });
    const app = makeApp();
    const classic = await request(app).get("/api/wordhunt/leaderboard").query(baseCreds);
    const golden = await request(app).get("/api/wordhunt/leaderboard").query({ ...baseCreds, mode: "golden" });

    expect(classic.body.data.entries.map((entry: any) => entry.name)).toEqual(["Ann"]);
    expect(golden.body.data.entries.map((entry: any) => entry.name)).toEqual(["Bob"]);
  });

  test("finishing a golden game can earn the golden badges", async () => {
    const tenGolden = ["cat", "cats", "act", "acts", "tab", "bat", "tabs", "bats", "scat", "tact"].map((word) => ({ word, points: 400 }));
    mockGoldenVisitor(goldenGame({ board: { ...goldenBoard, date: getBoardDate() }, foundWords: tenGolden, goldenBestStreak: 6 }));
    mockGetDroppedAsset.mockResolvedValue({ dataObject: {}, updateDataObject: jest.fn().mockResolvedValue({}) });

    const res = await request(makeApp()).post("/api/wordhunt/end").query({ ...baseCreds, mode: "golden" }).send({ gameId: "game-1" });
    expect(res.body.data.newBadges).toEqual(["Gold Rush!", "Midas Touch"]);
  });

  test("admin stats add both modes together by default, or show one mode", async () => {
    mockVisitorWithGame(null, { isAdmin: true });
    const today = getBoardDate();
    mockGetDroppedAsset.mockResolvedValue({
      dataObject: {
        wordHuntAnalytics: { [today]: { gamesStarted: 4, gamesCompleted: 4, wordsFound: 40 } },
        wordHuntGoldenAnalytics: { [today]: { gamesStarted: 2, gamesCompleted: 1, wordsFound: 20, goldenLetterWordsFound: 6 } },
      },
    });
    const app = makeApp();
    const get = (mode?: string) =>
      request(app).get("/api/wordhunt/admin/analytics").query({ ...baseCreds, days: 1, ...(mode && { mode }) });

    expect((await get()).body.data.totals).toMatchObject({ gamesStarted: 6, gamesCompleted: 5, averageWordsFound: 12 });
    expect((await get("all")).body.data.totals.gamesStarted).toBe(6);
    expect((await get("classic")).body.data.totals).toMatchObject({ gamesStarted: 4, averageWordsFound: 10 });
    expect((await get("golden")).body.data.totals).toMatchObject({ gamesStarted: 2, averageGoldenLetterWords: 6 });
    expect((await get("turbo")).status).toBe(400);
  });

  test("a golden game at the top of its leaderboard doesn't earn the classic CROWN!", async () => {
    const foundWords = [{ word: "cats", points: 1000 }];
    mockGoldenVisitor(goldenGame({ board: { ...goldenBoard, date: getBoardDate() }, foundWords }));
    mockGetDroppedAsset.mockResolvedValue({
      dataObject: { goldenDailyLeaderboard: { date: getBoardDate(), scores: { p1: "Ann|1000" } } },
      updateDataObject: jest.fn().mockResolvedValue({}),
    });
    const res = await request(makeApp())
      .post("/api/wordhunt/end")
      .query({ ...baseCreds, mode: "golden", profileId: "p1", displayName: "Ann" })
      .send({ gameId: "game-1" });

    expect(res.body.data.newBadges).not.toContain("CROWN!");
    const [update] = mockVisitorForSave.updateDataObject.mock.calls[0];
    expect(update[`${DATA_KEY}.wordhunt.stats`].wonCrown).toBe(false);
  });

  test("the shared GET /game-state route (what the client calls) loads the golden board", async () => {
    mockGoldenVisitor(null);
    const res = await request(makeApp()).get("/api/game-state").query({ ...baseCreds, game: "wordhunt", mode: "golden" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ mode: "golden", modes: { classic: "not_started", golden: "not_started" } });
    expect(res.body.data.board.goldenLetter).toMatch(/^[a-z]$/);
    const unknown = await request(makeApp()).get("/api/game-state").query({ ...baseCreds, game: "wordhunt", mode: "turbo" });
    // Refused. (The real errorHandler answers with the error's 400; this file's errorHandler stub always sends 500.)
    expect(unknown.body.success).toBe(false);
  });
});

