import { Request, Response } from "express";
import { errorHandler, getCredentials, getDroppedAsset, getVisitor, World } from "@utils/index.js";
import { getWordHuntGameState } from "../wordhunt/utils/getWordHuntGameState.js"; // adjust to your folder
import { getWordQuestGameState } from "../utils/wordquest/getWordQuestGameState.js";

type Credentials = ReturnType<typeof getCredentials>;

// One utility per challenge. Each returns that challenge's state.
const challengeUtilities: Record<string, (credentials: Credentials) => Promise<object>> = {
  wordhunt: getWordHuntGameState,
  wordquest: getWordQuestGameState,
};

export const handleGetGameState = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);

    // Defaults to wordhunt so the existing Word Hunt client keeps working unchanged
    const game = typeof req.query.game === "string" ? req.query.game : "wordhunt";
    if (!Object.hasOwn(challengeUtilities, game)) {
      return res.status(400).json({ success: false, error: "Unknown game." });
    }

    // Shared for every challenge
    const droppedAsset = await getDroppedAsset(credentials);

    const world = World.create(credentials.urlSlug, { credentials });
    world.triggerParticle({ name: "Sparkle", duration: 3, position: droppedAsset.position }).catch((error: any) =>
      errorHandler({
        error,
        functionName: "handleGetGameState",
        message: "Error triggering particle effects",
      }),
    );

    const { visitor } = await getVisitor(credentials, true);
    const { isAdmin } = visitor;

    const state = await challengeUtilities[game](credentials);

    return res.json({ success: true, droppedAsset, isAdmin, data: { ...state, isAdmin } });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleGetGameState",
      message: "Error getting game state",
      req,
      res,
    });
  }
};