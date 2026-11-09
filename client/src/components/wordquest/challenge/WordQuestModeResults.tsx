import { useEffect, useState } from "react";
import { backendAPI } from "@/utils";
import type { ChallengeGameState, ChallengeMode } from "@shared/types/WordQuestTypes";
import { WordQuestChallengeLeaderboardModal } from "./WordQuestChallengeLeaderboardModal";
import { getResultHeading, getWordLabel } from "./challengeLabels.ts";

interface Props {
  mode: ChallengeMode;
  onClose: () => void;
}

/** Results popup opened from the landing page: today's run (if any) plus the leaderboard. */
export const WordQuestModeResults = ({ mode, onClose }: Props) => {
  const [state, setState] = useState<ChallengeGameState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    backendAPI
      .get("/game-state", { params: { game: "wordquest", mode } })
      .then((response) => setState(response.data.data))
      .catch(() => {})
      .finally(() => setReady(true));
  }, [mode]);

  if (!ready) return null;

  return (
    <WordQuestChallengeLeaderboardModal
      mode={mode}
      refreshKey={state?.status ?? "none"}
      state={state}
      resultHeading={getResultHeading(state)}
      wordLabel={(i) => getWordLabel(state, i)}
      onClose={onClose}
    />
  );
};