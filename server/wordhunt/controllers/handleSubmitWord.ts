import { Request, Response } from "express";
import { WordHuntSubmitResult, WordHuntSubmitWordResponse } from "@shared/types/wordhunt/WordHuntTypes.js";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getWordFromPath } from "../utils/board.js";
import { getPointsForWord, MIN_WORD_LENGTH } from "../utils/constants.js";
import { isValidWord } from "../utils/dictionary.js";
import { finalizeIfExpired, finishGame, getWordHuntVisitor, isGameActive, saveGame } from "../utils/gameState.js";
import { tryRecordDailyScore } from "../utils/leaderboard.js";

export const handleSubmitWord = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const { gameId, path } = req.body || {};

    const { visitor, game, stats } = await getWordHuntVisitor(credentials);
    if (!game || game.gameId !== gameId) {
      return res.status(400).json({ success: false, error: "No Word Hunt game in progress" });
    }

    const respond = (result: WordHuntSubmitResult, word = "", points = 0) => {
      const data: WordHuntSubmitWordResponse = { result, word, points, game, serverTime: Date.now() };
      return res.json({ success: true, data });
    };

    if (!isGameActive(game)) {
      if (finalizeIfExpired(game)) {
        await finishGame({ credentials, visitor, game, stats });
        await tryRecordDailyScore({ credentials, game });
      }
      return respond("game_over");
    }

    // The word is derived from the tile path on the server's copy of the board, never trusted from the client.
    const word = getWordFromPath(game.board, path);
    if (word === null) return respond("invalid_path");
    if (word.length < MIN_WORD_LENGTH) return respond("too_short", word);
    if (game.foundWords.some((found) => found.word === word)) return respond("already_found", word);
    if (!isValidWord(word)) return respond("not_a_word", word);

    const points = getPointsForWord(word);
    game.foundWords.push({ word, points });
    game.score += points;
    await saveGame({ credentials, visitor, game });

    return respond("valid", word, points);
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleSubmitWord",
      message: "Error submitting Word Hunt word",
      req,
      res,
    });
  }
};
