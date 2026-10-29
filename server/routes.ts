import express from "express";
import {
  handleGetGameState,
  handleSubmitGuess,
  handleResetGame,
  handleClearAnswerList,
  handleSetAnswerList,
  handleGetAnswerList,
  handleGetLeaderboard,
} from "./controllers/index.js";
import { getVersion } from "@utils/getVersion.js";
import wordHuntRouter from "./wordhunt/routes.js";

const router = express.Router();
const SERVER_START_DATE = new Date();

router.get("/", (req, res) => {
  res.json({ message: "Hello from server!" });
});

router.get("/system/health", (req, res) => {
  return res.json({
    appVersion: getVersion(),
    status: "OK",
    serverStartDate: SERVER_START_DATE,
    envs: {
      NODE_ENV: process.env.NODE_ENV,
      INSTANCE_DOMAIN: process.env.INSTANCE_DOMAIN,
      INTERACTIVE_KEY: process.env.INTERACTIVE_KEY,
      S3_BUCKET: process.env.S3_BUCKET,
    },
  });
});

// Shared: one controller for every challenge (?game=wordhunt | wordquest)
router.get("/game-state", handleGetGameState);

// Word Hunt
router.use("/wordhunt", wordHuntRouter);

// WordQuest
router.post("/wordquest/guess", handleSubmitGuess);
router.post("/wordquest/reset", handleResetGame); // admin only
router.get("/wordquest/answers", handleGetAnswerList);
router.post("/wordquest/answers", handleSetAnswerList);
router.delete("/wordquest/answers", handleClearAnswerList);
router.get("/wordquest/leaderboard", handleGetLeaderboard);

export default router;