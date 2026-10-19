import { DroppedAssetInterface } from "@rtsdk/topia";

export interface IDroppedAsset extends DroppedAssetInterface {
  dataObject: {
    leaderboard?: Record<string, string>;
    /** Word Hunt: today's best scores as `{ [profileId]: "displayName|score" }`, reset when the board date changes. */
    dailyLeaderboard?: { date: string; scores: Record<string, string> };
  };
}
