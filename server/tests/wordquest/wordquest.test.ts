import express from "express";
import request from "supertest";

import router from "../../routes.js";
import { evaluateGuess } from "../../utils/wordquest/evaluateGuess.js";
import { pickDailyWord, getTodayDateString } from "../../utils/wordquest/pickDailyWord.js";
import { WORD_BANK_SET } from "../../utils/wordquest/words.js";

jest.mock("@utils/index.js", () => ({
  errorHandler: jest.fn(({ error, res }: any) => res?.status(500).json({ success: false, error: String(error) })),
  getCredentials: jest.fn((query: any) => ({ ...query, visitorId: Number(query.visitorId) })),
  getVisitor: jest.fn(),
}));

jest.mock("@utils/wordquest/answerPool.js", () => ({
  getAnswerPool: jest.fn().mockResolvedValue(["CRANE"]),
}));

const { getVisitor: mockGetVisitor } = jest.mocked(require("@utils/index.js"));

const baseCreds = {
  assetId: "asset-123",
  interactivePublicKey: "public-key",
  interactiveNonce: "nonce-xyz",
  sceneDropId: "scene-1",
  visitorId: 1,
  urlSlug: "my-world",
};
const DATA_KEY = "my-world-scene-1";
const WORDQUEST_PATH = `${DATA_KEY}.wordquest`;

const makeStats = () => ({
  gamesPlayed: 0,
  gamesWon: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastWonDate: null,
  guessDistribution: [0, 0, 0, 0, 0, 0],
});

const mockVisitor = (worldData: object) => {
  const visitor = {
    fetchDataObject: jest.fn().mockResolvedValue({ [DATA_KEY]: worldData }),
    setDataObject: jest.fn().mockResolvedValue({}),
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

describe("wordquest utils", () => {
  test("marks correct, present, and absent letters", () => {
    expect(evaluateGuess("CRANE", "CRANE")).toEqual(["correct", "correct", "correct", "correct", "correct"]);
    expect(evaluateGuess("NACRE", "CRANE")).toEqual(["present", "present", "present", "present", "correct"]);
  });

  test("only marks a repeated letter as many times as it appears in the answer", () => {
    // SPEED has two Es but ABIDE has one, so only the first E is marked present.
    expect(evaluateGuess("SPEED", "ABIDE")).toEqual(["absent", "absent", "present", "absent", "present"]);
    // An E in the right spot claims the answer's only E before any misplaced E can.
    expect(evaluateGuess("EERIE", "CRANE")).toEqual(["absent", "absent", "present", "absent", "correct"]);
  });

  test("picks the same word for the same date", () => {
    const pool = ["CRANE", "SLATE", "TRACE"];
    expect(pickDailyWord("2026-10-19", pool)).toBe(pickDailyWord("2026-10-19", pool));
    expect(() => pickDailyWord("2026-10-19", [])).toThrow();
  });

  test("loads the word bank from disk", () => {
    expect(WORD_BANK_SET.has("CRANE")).toBe(true);
  });
});

describe("wordquest routes", () => {
  beforeEach(() => jest.clearAllMocks());

  test("GET /wordquest/game-state starts today's puzzle without touching other games' data", async () => {
    const wordhunt = { game: { gameId: "wh-1" }, stats: { gamesPlayed: 3 } };
    const visitor = mockVisitor({ dateStarted: 1, wordhunt });

    const res = await request(makeApp()).get("/api/wordquest/game-state").query(baseCreds);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ guesses: [], status: "playing", maxGuesses: 6, wordLength: 5 });
    // The answer is never sent while the game is in progress.
    expect(res.body.data).not.toHaveProperty("targetWord");

    // Only the `.wordquest` path is written, so Word Hunt's game and stats under the same key survive.
    expect(visitor.setDataObject).not.toHaveBeenCalled();
    expect(visitor.updateDataObject).toHaveBeenCalledTimes(1);
    const [update] = visitor.updateDataObject.mock.calls[0];
    expect(Object.keys(update)).toEqual([WORDQUEST_PATH]);
    expect(update[WORDQUEST_PATH]).toMatchObject({ date: getTodayDateString(), targetWord: "CRANE", status: "playing" });
  });

  test("GET /wordquest/game-state returns a game already started today without saving", async () => {
    const visitor = mockVisitor({
      wordquest: { date: getTodayDateString(), targetWord: "CRANE", guesses: [], status: "playing", stats: makeStats() },
    });

    const res = await request(makeApp()).get("/api/wordquest/game-state").query(baseCreds);

    expect(res.status).toBe(200);
    expect(visitor.updateDataObject).not.toHaveBeenCalled();
  });

  test("POST /wordquest/guess records a win and reveals the answer", async () => {
    const visitor = mockVisitor({
      wordhunt: { game: { gameId: "wh-1" } },
      wordquest: { date: getTodayDateString(), targetWord: "CRANE", guesses: [], status: "playing", stats: makeStats() },
    });

    const res = await request(makeApp()).post("/api/wordquest/guess").query(baseCreds).send({ guess: "crane" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "won", targetWord: "CRANE" });
    expect(res.body.data.stats).toMatchObject({ gamesPlayed: 1, gamesWon: 1, currentStreak: 1 });

    const [update] = visitor.updateDataObject.mock.calls[0];
    expect(Object.keys(update)).toEqual([WORDQUEST_PATH]);
    expect(update[WORDQUEST_PATH]).toMatchObject({ status: "won" });
  });

  test("POST /wordquest/guess rejects words that aren't in the word bank", async () => {
    const visitor = mockVisitor({
      wordquest: { date: getTodayDateString(), targetWord: "CRANE", guesses: [], status: "playing", stats: makeStats() },
    });

    const res = await request(makeApp()).post("/api/wordquest/guess").query(baseCreds).send({ guess: "QQQQQ" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Not a valid word." });
    expect(visitor.updateDataObject).not.toHaveBeenCalled();
  });
});
