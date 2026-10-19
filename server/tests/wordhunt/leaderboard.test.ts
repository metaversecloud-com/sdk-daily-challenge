import express from "express";
import request from "supertest";

import router from "../../wordhunt/routes.js";
import { getBoardDate } from "../../wordhunt/utils/board.js";
import { parseLeaderboard, recordDailyScore } from "../../wordhunt/utils/leaderboard.js";

jest.mock("@utils/index.js", () => ({
  errorHandler: jest.fn(({ error, res }: any) => res?.status(500).json({ success: false, error: String(error) })),
  getCredentials: jest.fn((query: any) => ({ ...query, visitorId: Number(query.visitorId) })),
}));
jest.mock("@utils/errorHandler.js", () => ({ errorHandler: jest.fn() }));
jest.mock("@utils/droppedAssets/getDroppedAsset.js", () => ({ getDroppedAsset: jest.fn() }));

const { getDroppedAsset: mockGetDroppedAsset } = jest.mocked(require("@utils/droppedAssets/getDroppedAsset.js"));

const today = getBoardDate();
const credentials = {
  assetId: "a",
  profileId: "p1",
  displayName: "Ann",
  urlSlug: "w",
  sceneDropId: "s",
  visitorId: 1,
} as any;
const makeGame = (score: number, date = today) => ({ score, board: { date } }) as any;

const mockAsset = (dailyLeaderboard?: object) => {
  const asset = { dataObject: { dailyLeaderboard }, updateDataObject: jest.fn().mockResolvedValue({}) };
  mockGetDroppedAsset.mockResolvedValue(asset);
  return asset;
};

describe("parseLeaderboard", () => {
  test("ranks by score descending, ties alphabetically", () => {
    const ranked = parseLeaderboard({ a: "Zed|400", b: "Amy|800", c: "Bob|400" });
    expect(ranked.map((e) => [e.rank, e.name, e.score])).toEqual([
      [1, "Amy", 800],
      [2, "Bob", 400],
      [3, "Zed", 400],
    ]);
  });

  test("handles missing data", () => {
    expect(parseLeaderboard(undefined)).toEqual([]);
  });
});

describe("recordDailyScore", () => {
  test("starts a new day's leaderboard when the stored date is old", async () => {
    const asset = mockAsset({ date: "2020-01-01", scores: { old: "Old|9999" } });
    await recordDailyScore({ credentials, game: makeGame(400) });
    expect(asset.updateDataObject).toHaveBeenCalledWith(
      { dailyLeaderboard: { date: today, scores: { p1: "Ann|400" } } },
      {},
    );
  });

  test("only raises a player's own entry", async () => {
    const asset = mockAsset({ date: today, scores: { p1: "Ann|800" } });
    await recordDailyScore({ credentials, game: makeGame(400) });
    expect(asset.updateDataObject).not.toHaveBeenCalled();

    await recordDailyScore({ credentials, game: makeGame(1200) });
    expect(asset.updateDataObject).toHaveBeenCalledWith({ "dailyLeaderboard.scores.p1": "Ann|1200" }, {});
  });

  test("ignores zero scores and games from another day's board", async () => {
    const asset = mockAsset();
    await recordDailyScore({ credentials, game: makeGame(0) });
    await recordDailyScore({ credentials, game: makeGame(400, "2020-01-01") });
    expect(asset.updateDataObject).not.toHaveBeenCalled();
  });

  test("strips the field separator from display names", async () => {
    const asset = mockAsset();
    await recordDailyScore({ credentials: { ...credentials, displayName: "A|B" }, game: makeGame(200) });
    expect(asset.updateDataObject).toHaveBeenCalledWith(
      { dailyLeaderboard: { date: today, scores: { p1: "AB|200" } } },
      {},
    );
  });
});

describe("GET /wordhunt/leaderboard", () => {
  const app = express().use(express.json()).use("/api/wordhunt", router);

  test("returns today's top scores plus the player's own rank", async () => {
    const scores: Record<string, string> = {};
    for (let i = 0; i < 12; i++) scores[`x${i}`] = `P${i}|${1000 - i * 10}`;
    scores.p1 = "Ann|5";
    mockAsset({ date: today, scores });

    const res = await request(app).get("/api/wordhunt/leaderboard").query(credentials);
    expect(res.body.data.entries).toHaveLength(10);
    expect(res.body.data.entries[0]).toMatchObject({ name: "P0", rank: 1 });
    expect(res.body.data.me).toMatchObject({ name: "Ann", rank: 13, score: 5 });
  });

  test("ignores stale scores", async () => {
    mockAsset({ date: "2020-01-01", scores: { p1: "Ann|500" } });
    const res = await request(app).get("/api/wordhunt/leaderboard").query(credentials);
    expect(res.body.data).toMatchObject({ date: today, entries: [], me: null });
  });
});
