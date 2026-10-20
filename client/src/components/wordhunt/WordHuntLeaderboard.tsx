import { useContext, useEffect, useState } from "react";

// context
import { GlobalStateContext } from "@/context/GlobalContext";

// types
import { WordHuntLeaderboardResponse } from "@shared/types/wordhunt/WordHuntTypes";

// utils
import { backendAPI } from "@/utils";

interface WordHuntLeaderboardProps {
  /** Changing this value reloads the leaderboard (e.g. after a game ends). */
  refreshKey?: string;
}

export const WordHuntLeaderboard = ({ refreshKey }: WordHuntLeaderboardProps) => {
  const { hasInteractiveParams } = useContext(GlobalStateContext);

  const [leaderboard, setLeaderboard] = useState<WordHuntLeaderboardResponse | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!hasInteractiveParams) return;
    let isCurrent = true;
    setHasError(false);
    backendAPI
      .get("/wordhunt/leaderboard")
      .then((response) => {
        if (isCurrent) setLeaderboard(response.data.data as WordHuntLeaderboardResponse);
      })
      .catch(() => {
        if (isCurrent) setHasError(true);
      });
    return () => {
      isCurrent = false;
    };
  }, [hasInteractiveParams, refreshKey]);

  const entries = leaderboard?.entries ?? [];
  const me = leaderboard?.me;
  const isMeListed = !!me && entries.some((entry) => entry.profileId === me.profileId);

  return (
    <section className="wh-panel" aria-labelledby="wh-leaderboard-heading">
      <h2 id="wh-leaderboard-heading" className="h4 mb-2">
        Today&apos;s Leaderboard
      </h2>

      {hasError ? (
        <p className="p2">The leaderboard couldn&apos;t be loaded right now.</p>
      ) : !leaderboard ? (
        <p className="p2" role="status">
          Loading…
        </p>
      ) : entries.length === 0 ? (
        <p className="p2">No scores yet today. Be the first!</p>
      ) : (
        <table className="wh-leaderboard p2">
          <caption className="sr-only">Highest Word Hunt scores for today</caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Player</th>
              <th scope="col">Points</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.profileId} className={entry.profileId === me?.profileId ? "wh-leaderboard-me" : undefined}>
                <td>{entry.rank}</td>
                <td>{entry.name}</td>
                <td>{entry.score.toLocaleString()}</td>
              </tr>
            ))}
            {me && !isMeListed && (
              <tr className="wh-leaderboard-me">
                <td>{me.rank}</td>
                <td>{me.name}</td>
                <td>{me.score.toLocaleString()}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
};

export default WordHuntLeaderboard;
