import { Credentials } from "../types/index.js";
import { Ecosystem } from "./topiaInit.js";

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type CacheEntry = { items: any[]; fetchedAt: number };
// One entry per ecosystem (urlSlug), kept in memory for the life of the server
const cache = new Map<string, CacheEntry>();

/**
 * Ecosystem inventory items (badges, etc.), cached for 24 hours.
 * forceRefresh bypasses the cache; if Topia can't be reached, stale data is used instead of failing.
 */
export const getCachedInventoryItems = async ({
  credentials,
  forceRefresh = false,
}: {
  credentials: Credentials;
  forceRefresh?: boolean;
}): Promise<any[]> => {
  const key = credentials.urlSlug;
  const cached = cache.get(key);

  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.items;

  try {
    const ecosystem = await Ecosystem.create({ credentials });
    await ecosystem.fetchInventoryItems();
    const items = (ecosystem.inventoryItems as any[]) ?? [];
    cache.set(key, { items, fetchedAt: Date.now() });
    return items;
  } catch (error) {
    if (cached) {
      console.error("Inventory fetch failed, using stale cache", error);
      return cached.items;
    }
    throw error;
  }
};