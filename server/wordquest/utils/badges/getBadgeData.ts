import { Credentials } from "../../../types/index.js";
import { getBadges, getVisitorBadges } from "../../../utils/index.js";
import { BADGES } from "./badgeCatalog.js";

const EMPTY = { badges: {}, visitorInventory: { badges: {} } };

/**
 * Everything the client needs to draw the badges tab: all ecosystem badges (in catalog order)
 * and the ones this visitor owns. Never throws; if Topia can't be reached the tab is just empty.
 */
export const getBadgeData = async (credentials: Credentials, visitor: any, forceRefresh = false) => {
  try {
    const all = await getBadges(credentials, forceRefresh);
    await visitor.fetchInventoryItems();
    const visitorInventory = getVisitorBadges(visitor.inventoryItems);

    // Catalog order first, then anything else that's in the ecosystem
    const ordered: typeof all = {};
    for (const name of Object.values(BADGES)) if (all[name]) ordered[name] = all[name];
    for (const [name, badge] of Object.entries(all)) if (!ordered[name]) ordered[name] = badge;

    return { badges: ordered, visitorInventory };
  } catch (error) {
    console.error("getBadgeData failed", error);
    return EMPTY;
  }
};