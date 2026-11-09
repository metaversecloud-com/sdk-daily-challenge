import { Credentials } from "../../../types/index.js";
import { getCachedInventoryItems, getVisitorBadges } from "../../../utils/index.js";
import type { BadgeName } from "./badgeCatalog.js";

/**
 * Grants every badge in `earned` that the visitor doesn't own yet.
 * Never throws: a badge problem must not break a guess or end-of-run response.
 * Returns the names that were newly granted.
 */
export const awardBadges = async ({
  credentials,
  visitor,
  earned,
}: {
  credentials: Credentials;
  visitor: any;
  earned: BadgeName[];
}): Promise<BadgeName[]> => {
  const granted: BadgeName[] = [];
  if (!earned.length) return granted;

  try {
    await visitor.fetchInventoryItems();
    const owned = getVisitorBadges(visitor.inventoryItems).badges;
    const missing = [...new Set(earned)].filter((name) => !owned[name]);
    if (!missing.length) return granted;

    const items = await getCachedInventoryItems({ credentials });

    for (const name of missing) {
      const item = items?.find((i) => i.name === name && i.type === "BADGE");
      if (!item) {
        console.error(
          `Badge "${name}" not found. Inventory has:`,
          (items ?? []).map((i) => `${i.name} | ${i.type} | ${i.status}`),
        );
        continue;
      }
      try {
        await visitor.grantInventoryItem(item, 1);
        granted.push(name);
        visitor
          .fireToast({ groupId: "badges", title: `You unlocked the ${name} badge!`, text: "" })
          .catch(() => console.error(`Failed to fire toast for ${name}`));
      } catch (err) {
        console.error(`Failed to grant "${name}"`, err);
      }
    }
  } catch (err) {
    console.error("awardBadges failed", err);
  }
  return granted;
};