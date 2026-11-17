import { Request, Response } from "express";
import { WordHuntGame, WordHuntSubmitResult, WordHuntSubmitWordResponse } from "@shared/types/wordhunt/WordHuntTypes.js";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getWordFromPath } from "../utils/board.js";
import { getPointsForWord, MIN_WORD_LENGTH } from "../utils/constants.js";
import { isValidWord } from "../utils/dictionary.js";
import {
  addFoundWord,
  finalizeIfExpired,
  finishGame,
  getCachedGame,
  getVisitorForSave,
  getWordHuntVisitor,
  isGameActive,
} from "../utils/gameState.js";
import { tryRecordDailyScore } from "../utils/leaderboard.js";
import { parseMode, UNKNOWN_MODE_ERROR } from "../utils/mode.js";
import { scoreGoldenWord } from "@shared/wordhunt/golden.js";

/**
 * Checks one word and saves it if it's new and valid. Words can be submitted in parallel: the game is usually
 * already in this server's memory, so a valid word costs a single request to Topia (saving that one word) and
 * an invalid word costs none.
 */
export const handleSubmitWord = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const mode = parseMode(req.query.mode);
    if (!mode) return res.status(400).json(UNKNOWN_MODE_ERROR);
    const { gameId, path } = req.body || {};

    let game: WordHuntGame | null = getCachedGame(credentials, mode, gameId);
    if (!game) game = (await getWordHuntVisitor(credentials, { mode })).game;
    if (!game || game.gameId !== gameId) {
      return res.status(400).json({ success: false, error: "No Word Hunt game in progress" });
    }

    const respond = (result: WordHuntSubmitResult, word = "", points = 0, golden?: { multiplier: number; streak: number }) => {
      const data: WordHuntSubmitWordResponse = {
        result,
        word,
        points,
        ...(golden && { multiplier: golden.multiplier, goldenStreak: golden.streak }),
        game: game!,
        serverTime: Date.now(),
      };
      return res.json({ success: true, data });
    };

    if (!isGameActive(game)) {
      // Rare: the timer ran out without the game being ended. Load the latest save (with stats) to finish it.
      const { visitor, game: latestGame, stats } = await getWordHuntVisitor(credentials, { mode });
      if (latestGame && latestGame.gameId === gameId && finalizeIfExpired(latestGame)) {
        await finishGame({ credentials, visitor, game: latestGame, stats });
        await tryRecordDailyScore({ credentials, game: latestGame });
        game = latestGame;
      }
      return respond("game_over");
    }

    // The word is derived from the tile path on the server's copy of the board, never trusted from the client.
    const word = getWordFromPath(game.board, path);
    if (word === null) return respond("invalid_path");
    if (word.length < MIN_WORD_LENGTH) return respond("too_short", word);
    if (game.foundWords.some((found) => found.word === word)) return respond("already_found", word);
    if (!isValidWord(word)) return respond("not_a_word", word);

    const basePoints = getPointsForWord(word);
    if (mode === "golden") {
      // Golden letter: x2, plus 0.5x for each golden word in a row (the shared rules the client also uses).
      const { points, multiplier, streak } = scoreGoldenWord(word, basePoints, game.board.goldenLetter, game.goldenStreak ?? 0);
      await addFoundWord({ credentials, visitor: getVisitorForSave(credentials), game, word, points, goldenStreak: streak });
      return respond("valid", word, points, { multiplier, streak });
    }

    await addFoundWord({ credentials, visitor: getVisitorForSave(credentials), game, word, points: basePoints });
    return respond("valid", word, basePoints);
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
