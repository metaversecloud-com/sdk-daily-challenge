import { Credentials } from "../types/index.js";
import { getCachedInventoryItems } from "./inventoryCache.js";

export type BadgeRecord = {
  [name: string]: { id: string; name: string; icon: string; description: string };
};

const sortOrderOf = (item: { metadata?: object | null }) =>
  (item.metadata as { sortOrder?: number } | null | undefined)?.sortOrder ?? Infinity;

/** All active badges in the ecosystem inventory (cached). */
export const getBadges = async (credentials: Credentials, forceRefresh = false): Promise<BadgeRecord> => {
  const inventoryItems = await getCachedInventoryItems({ credentials, forceRefresh });

  const badgeItems = inventoryItems
    .filter((item) => item.name && item.type === "BADGE" && item.status === "ACTIVE")
    .sort((a, b) => sortOrderOf(a) - sortOrderOf(b));

  const badges: BadgeRecord = {};
  for (const item of badgeItems) {
    const { id, name, image_path, description } = item;
    if (!name) continue;
    badges[name] = { id: id ?? "", name, icon: image_path || "", description: description || "" };
  }
  return badges;
};