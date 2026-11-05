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

// The visitor the fast submit path saves with (Visitor.create makes no request to Topia).
let mockVisitorForSave: any;
jest.mock("@utils/topiaInit.js", () => ({ Visitor: { create: jest.fn(() => mockVisitorForSave) } }));

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

const mockVisitorWithGame = (game: object | null) => {
  const visitor = {
    dataObject: { [DATA_KEY]: { dateStarted: 1, ...(game ? { wordhunt: { game } } : {}) } },
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
    expect(mockGetVisitor).toHaveBeenCalledWith(expect.objectContaining({ urlSlug: "my-world", visitorId: 1 }), false, {
      includeInventory: false,
    });
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
      {},
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
    expect(visitor.updateDataObject).toHaveBeenCalledWith({ [`${DATA_KEY}.wordhunt.game`]: toStoredGame(game) }, {});
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
      {},
    );
  });

  test("POST /wordhunt/start starts a new game when the last one was on an earlier day", async () => {
    const visitor = mockVisitorWithGame(makeGame({ endedAt: Date.now() - 60_000, endReason: "timeout" }));
    const res = await request(makeApp()).post("/api/wordhunt/start").query(baseCreds);

    expect(res.body.data.game.gameId).not.toBe("game-1");
    expect(res.body.data.game.endedAt).toBeNull();
    expect(visitor.updateDataObject).toHaveBeenCalledWith(
      { [`${DATA_KEY}.wordhunt.game`]: toStoredGame(res.body.data.game) },
      {},
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
      {},
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
