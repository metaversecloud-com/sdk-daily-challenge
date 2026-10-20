import { Request, Response } from "express";
import { WordHuntGameStateResponse } from "@shared/types/wordhunt/WordHuntTypes.js";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getDailyBoard } from "../utils/board.js";
import { createGame, finalizeIfExpired, finishGame, getWordHuntVisitor, isGameActive, saveGame } from "../utils/gameState.js";
import { tryRecordDailyScore } from "../utils/leaderboard.js";

export const handleStartWordHunt = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const board = getDailyBoard();

    const { visitor, game: existingGame, stats } = await getWordHuntVisitor(credentials);

    // Each player gets one game per daily board. If today's game has already finished, return it instead of
    // starting a new one so the player sees their results.
    if (existingGame && existingGame.board.date === board.date && !isGameActive(existingGame)) {
      if (finalizeIfExpired(existingGame)) {
        await finishGame({ credentials, visitor, game: existingGame, stats });
        await tryRecordDailyScore({ credentials, game: existingGame });
      }
      const data: WordHuntGameStateResponse = { board, game: existingGame, serverTime: Date.now() };
      return res.json({ success: true, data });
    }

    // If a game on today's board is still running (e.g. the drawer was closed and reopened), resume it.
    let game = existingGame;
    if (!isGameActive(game) || game.board.date !== board.date) {
      // A game from an earlier day that was never ended (e.g. the drawer was closed) still counts toward stats and badges.
      if (existingGame && !existingGame.endedAt) {
        const now = Date.now();
        existingGame.endedAt = Math.min(now, existingGame.endsAt);
        existingGame.endReason = now >= existingGame.endsAt ? "timeout" : "quit";
        await finishGame({ credentials, visitor, game: existingGame, stats });
      }
      game = createGame(board);
      await saveGame({ credentials, visitor, game });
    }

    const data: WordHuntGameStateResponse = { board, game, serverTime: Date.now() };
    return res.json({ success: true, data });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleStartWordHunt",
      message: "Error starting Word Hunt game",
      req,
      res,
    });
  }
};
