import { Response } from "express";
import { getVisitor } from "@utils/getVisitor.js";
import { Credentials } from "../../types/index.js";

/** Responds 403 and returns false unless the player is an admin of this world (checked with Topia, never trusted from the client). */
export const requireAdmin = async (credentials: Credentials, res: Response) => {
  const { visitor } = await getVisitor(credentials, true, { includeInventory: false });
  if (visitor.isAdmin) return true;
  res.status(403).json({ success: false, error: "Only world admins can do that." });
  return false;
};
