import { Request, Response } from "express";
import { WordHuntGameStateResponse } from "@shared/types/wordhunt/WordHuntTypes.js";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getDailyBoard } from "../utils/board.js";
import { createGame, finishGame, getWordHuntVisitor, isGameActive, saveGame } from "../utils/gameState.js";

export const handleStartWordHunt = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const board = getDailyBoard();

    const { visitor, game: existingGame, stats } = await getWordHuntVisitor(credentials);

    // If a game on today's board is still running (e.g. the drawer was closed and reopened), resume it.
    let game = existingGame;
    if (!isGameActive(game) || game.board.date !== board.date) {
      // A game that was never ended (e.g. the drawer was closed) still counts toward stats and badges.
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
