import express from "express";
import request from "supertest";

import router from "../../routes.js";
import { areAdjacent, findAllWords, getBoardDate, getDailyBoard, getWordFromPath } from "../../wordhunt/utils/board.js";
import { getPointsForWord } from "../../wordhunt/utils/constants.js";
import { isBlockedWord, isValidWord } from "../../wordhunt/utils/dictionary.js";

jest.mock("@utils/index.js", () => ({
  errorHandler: jest.fn(({ error, res }: any) => res?.status(500).json({ success: false, error: String(error) })),
  getCredentials: jest.fn((query: any) => ({ ...query, visitorId: Number(query.visitorId) })),
}));

jest.mock("@utils/getVisitor.js", () => ({
  getVisitor: jest.fn(),
}));

const { getVisitor: mockGetVisitor } = jest.mocked(require("@utils/getVisitor.js"));

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

describe("wordhunt routes", () => {
  beforeEach(() => jest.clearAllMocks());

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
      { [`${DATA_KEY}.wordhunt.game`]: expect.objectContaining({ endReason: "timeout" }) },
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
    expect(visitor.updateDataObject).toHaveBeenCalledWith({ [`${DATA_KEY}.wordhunt.game`]: game }, {});
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
    expect(visitor.updateDataObject).toHaveBeenCalledTimes(1);
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
});
