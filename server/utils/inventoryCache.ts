import { InventoryItemInterface } from "@rtsdk/topia";
import { Credentials } from "../types/index.js";
import { Ecosystem } from "./topiaInit.js";
import { standardizeError } from "./standardizeError.js";

interface CachedInventory {
  items: InventoryItemInterface[];
  timestamp: number;
}

// Cache duration: 6 hours in milliseconds
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000;

// In-memory cache
let inventoryCache: CachedInventory | null = null;

/**
 * Get ecosystem inventory items (badges, etc.) with caching.
 * Pass forceRefresh: true to bypass the cache (used when a new inventory ZIP is uploaded).
 */
export const getCachedInventoryItems = async ({
  credentials,
  forceRefresh = false,
}: {
  credentials: Credentials;
  forceRefresh?: boolean;
}): Promise<InventoryItemInterface[]> => {
  try {
    const now = Date.now();
    if (inventoryCache !== null && !forceRefresh && now - inventoryCache.timestamp < CACHE_DURATION_MS) {
      return inventoryCache.items;
    }

    const ecosystem = Ecosystem.create({ credentials });
    await ecosystem.fetchInventoryItems();

    inventoryCache = { items: ecosystem.inventoryItems as InventoryItemInterface[], timestamp: now };
    return inventoryCache.items;
  } catch (error) {
    // If the fetch fails but a stale cache exists, use it.
    if (inventoryCache !== null) {
      console.warn("Failed to fetch fresh inventory, using stale cache", error);
      return inventoryCache.items;
    }
    throw standardizeError(error);
  }
};

export const clearInventoryCache = (): void => {
  inventoryCache = null;
};
