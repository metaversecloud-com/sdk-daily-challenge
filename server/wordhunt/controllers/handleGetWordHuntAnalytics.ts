import { Request, Response } from "express";
import { errorHandler, getCredentials } from "@utils/index.js";
import { getAnalyticsSummary } from "../utils/analytics.js";
import { MAX_ANALYTICS_DAYS } from "../utils/analyticsSummary.js";
import { requireAdmin } from "../utils/requireAdmin.js";
import { parseMode, UNKNOWN_MODE_ERROR } from "../utils/mode.js";

const DEFAULT_DAYS = 7;

/**
 * Admin only: Word Hunt stats for the last `?days=` board days (default 7, up to 90), newest first, plus totals.
 * `?mode=all` (the default) adds every game mode together; `?mode=classic|golden` shows one mode.
 * Each day has games started/completed/quit/timed out, words found, points, time played, and the completion
 * rate, quit rate, and per-game averages worked out from them.
 */
export const handleGetWordHuntAnalytics = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    if (!(await requireAdmin(credentials, res))) return;
    // Both modes together unless a single mode is asked for.
    const mode = req.query.mode === undefined || req.query.mode === "all" ? "all" : parseMode(req.query.mode);
    if (!mode) return res.status(400).json(UNKNOWN_MODE_ERROR);

    const requested = Number(req.query.days);
    const days = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_ANALYTICS_DAYS) : DEFAULT_DAYS;

    return res.json({ success: true, data: await getAnalyticsSummary(credentials, days, mode) });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleGetWordHuntAnalytics",
      message: "Error getting Word Hunt analytics",
      req,
      res,
    });
  }
};
