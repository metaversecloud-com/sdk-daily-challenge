import express from "express";
import { handleEndWordHunt, handleGetWordHuntState, handleStartWordHunt, handleSubmitWord } from "./controllers/index.js";

const wordHuntRouter = express.Router();

wordHuntRouter.get("/game-state", handleGetWordHuntState);
wordHuntRouter.post("/start", handleStartWordHunt);
wordHuntRouter.post("/submit-word", handleSubmitWord);
wordHuntRouter.post("/end", handleEndWordHunt);

export default wordHuntRouter;
