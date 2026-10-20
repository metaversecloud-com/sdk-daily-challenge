import { VisitorInterface } from "@rtsdk/topia";
import { getCachedInventoryItems } from "@utils/inventoryCache.js";
import { Credentials } from "../../types/index.js";

/**
 * Grants badges from the ecosystem inventory and (optionally) announces them with a toast.
 * Never throws: a badge problem must not break the game.
 */
export const grantBadges = async ({
  credentials,
  visitor,
  names,
  announce = true,
}: {
  credentials: Credentials;
  visitor: VisitorInterface;
  names: string[];
  announce?: boolean;
}) => {
  if (names.length === 0) return;
  try {
    const items = await getCachedInventoryItems({ credentials });
    for (const name of names) {
      try {
        const item = items.find((candidate) => candidate.name === name && candidate.type === "BADGE");
        if (!item) {
          console.warn(`Word Hunt badge "${name}" not found in ecosystem inventory`);
          continue;
        }
        await visitor.grantInventoryItem(item, 1);
        if (announce) {
          visitor
            .fireToast({ title: "Badge Awarded", text: `You have earned the ${name} badge!` })
            .catch(() => console.error(`Failed to fire toast for the ${name} badge.`));
        }
      } catch (error) {
        console.error(`Failed to grant the ${name} badge`, error);
      }
    }
  } catch (error) {
    console.error("Failed to grant Word Hunt badges", error);
  }
};
