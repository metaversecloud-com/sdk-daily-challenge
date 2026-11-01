import { useEffect, useId, useState } from "react";
import { backendAPI } from "@/utils";
import type { ChallengeLeaderboardRow, ChallengeMode } from "@shared/types/WordQuestTypes";

const formatTime = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

interface Props {
  mode: ChallengeMode;
  refreshKey: string; // change it to reload, e.g. when a run ends
  showHeading?: boolean;
}

export const WordQuestChallengeLeaderboard = ({ mode, refreshKey, showHeading = true }: Props) => {
  const headingId = useId();
  const [rows, setRows] = useState<ChallengeLeaderboardRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    backendAPI
      .get("/wordquest/challenge/leaderboard", { params: { mode } })
      .then((response) => {
        if (cancelled) return;
        setRows(response.data.data);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, refreshKey]);

  return (
    <section className="wordquest-challenge-leaderboard" aria-labelledby={headingId}>
        <h3 className={showHeading ? "h4" : "sr-only"} id={headingId}>
        Best runs
      </h3>

      {failed && <p className="p3">Could not load the leaderboard.</p>}
      {!failed && rows && rows.length === 0 && <p className="p3">No runs yet. Be the first!</p>}

      {!failed && rows && rows.length > 0 && (
        <table className="wordquest-lb-table">
          <caption className="sr-only">Best {mode === "timed" ? "timed" : "sudden death"} runs</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Player</th>
              <th scope="col">Words</th>
              <th scope="col">{mode === "timed" ? "Time left" : "Guesses"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.displayName}-${i}`}>
                <td>{i + 1}</td>
                <td>{row.displayName}</td>
                <td>{row.wordsSolved}</td>
                <td>{mode === "timed" ? formatTime(row.timeLeftMs ?? 0) : row.totalGuesses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};