const topiaMock = require("../mocks/@rtsdk/topia").__mock;

import express from "express";
import request from "supertest";
import axios from "axios";

import router from "../routes.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  return app;
}

const baseCreds = {
  assetId: "asset-123",
  interactivePublicKey: process.env.INTERACTIVE_KEY,
  interactiveNonce: "nonce-xyz",
  visitorId: 1,
  urlSlug: "my-world",
};

// Mock axios for external API calls
jest.mock("axios");
const mockedAxios = jest.mocked(axios);

// Mock the utils
jest.mock("@utils/index.js", () => ({
  errorHandler: jest.fn(),
  getCredentials: jest.fn(),
  getDroppedAsset: jest.fn(),
  Visitor: {
    get: jest.fn(),
  },
  World: {
    create: jest.fn(),
  },
}));

const mockUtils = jest.mocked(require("@utils/index.js"));

describe("routes", () => {
  beforeEach(() => {
    topiaMock.reset();
    jest.clearAllMocks();
  });

  test("GET /system/health returns status OK and env keys", async () => {
    const app = makeApp();
    let res = await request(app).get("/api/system/health");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "OK");
    expect(res.body).toHaveProperty("envs");
    expect(res.body.envs).toHaveProperty("NODE_ENV");
  });
});
