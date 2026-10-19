import { Request, Response } from "express";
import { WordHuntBadgesResponse } from "@shared/types/wordhunt/WordHuntTypes.js";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getCachedInventoryItems } from "@utils/inventoryCache.js";
import { buildBadgeList, getEarnedNames } from "../utils/badges.js";
import { getWordHuntVisitor } from "../utils/gameState.js";
import { grantBadges } from "../utils/grantBadges.js";

export const handleGetWordHuntBadges = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const forceRefreshInventory = req.query.forceRefreshInventory === "true";

    const { visitor, stats, visitorInventory } = await getWordHuntVisitor(credentials, { includeInventory: true });
    const owned = Object.keys(visitorInventory || {});
    const badges = buildBadgeList(stats, owned);

    // Self-heal: grant badges the player has earned but that never made it into their inventory
    // (for example, the badge items had not been uploaded to the ecosystem yet).
    const missing = getEarnedNames(stats).filter((name) => !owned.includes(name));
    if (missing.length > 0) {
      if (forceRefreshInventory) await getCachedInventoryItems({ credentials, forceRefresh: true }).catch(() => null);
      await grantBadges({ credentials, visitor, names: missing, announce: false });
    }

    const data: WordHuntBadgesResponse = { badges };
    return res.json({ success: true, data });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleGetWordHuntBadges",
      message: "Error getting Word Hunt badges",
      req,
      res,
    });
  }
};
