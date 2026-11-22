import { WORD_HUNT_MODES, WordHuntGame, WordHuntMode } from "@shared/types/wordhunt/WordHuntTypes.js";

/** Reads the `mode` query parameter: missing means classic; anything unknown returns null. */
export const parseMode = (value: unknown): WordHuntMode | null => {
  if (value === undefined || value === "") return "classic";
  return WORD_HUNT_MODES.includes(value as WordHuntMode) ? (value as WordHuntMode) : null;
};

/** A game's mode (games saved before modes existed are classic). */
export const getGameMode = (game: Pick<WordHuntGame, "mode"> | null | undefined): WordHuntMode => game?.mode ?? "classic";

export const UNKNOWN_MODE_ERROR = { success: false, error: "Unknown Word Hunt mode." };
