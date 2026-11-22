export type VisitorBadgeRecord = { [name: string]: { id: string; name: string; icon: string } };
export type VisitorInventory = { badges: VisitorBadgeRecord };

/** Badges a visitor owns. Call visitor.fetchInventoryItems() first. */
export const getVisitorBadges = (visitorInventoryItems: any[]): VisitorInventory => {
  const visitorInventory: VisitorInventory = { badges: {} };

  for (const visitorItem of visitorInventoryItems ?? []) {
    const { id, status, item } = visitorItem;
    const { name, type, image_url = "" } = item || {};
    if (status === "ACTIVE" && type === "BADGE" && name) {
      visitorInventory.badges[name] = { id, name, icon: image_url };
    }
  }
  return visitorInventory;
};