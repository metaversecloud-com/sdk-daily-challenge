import express from "express";
import {
  handleEndWordHunt,
  handleGetWordHuntBadges,
  handleGetWordHuntLeaderboard,
  handleGetWordHuntState,
  handleStartWordHunt,
  handleSubmitWord,
  handleClearWordHuntLeaderboard,
  handleResetWordHuntPlay,
} from "./controllers/index.js";

const wordHuntRouter = express.Router();

wordHuntRouter.get("/game-state", handleGetWordHuntState);
wordHuntRouter.get("/badges", handleGetWordHuntBadges);
wordHuntRouter.get("/leaderboard", handleGetWordHuntLeaderboard);
wordHuntRouter.post("/start", handleStartWordHunt);
wordHuntRouter.post("/submit-word", handleSubmitWord);
wordHuntRouter.post("/end", handleEndWordHunt);

// Admin tools (each checks that the player is a world admin)
wordHuntRouter.post("/admin/clear-leaderboard", handleClearWordHuntLeaderboard);
wordHuntRouter.post("/admin/reset-play", handleResetWordHuntPlay);

export default wordHuntRouter;
