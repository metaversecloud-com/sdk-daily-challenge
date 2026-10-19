import express from "express";
import {
  handleEndWordHunt,
  handleGetWordHuntBadges,
  handleGetWordHuntLeaderboard,
  handleGetWordHuntState,
  handleStartWordHunt,
  handleSubmitWord,
} from "./controllers/index.js";

const wordHuntRouter = express.Router();

wordHuntRouter.get("/game-state", handleGetWordHuntState);
wordHuntRouter.get("/badges", handleGetWordHuntBadges);
wordHuntRouter.get("/leaderboard", handleGetWordHuntLeaderboard);
wordHuntRouter.post("/start", handleStartWordHunt);
wordHuntRouter.post("/submit-word", handleSubmitWord);
wordHuntRouter.post("/end", handleEndWordHunt);

export default wordHuntRouter;
