import { useEffect, useState } from "react";

import { backendAPI } from "@/utils";
import { LeaderboardRow } from "@shared/types/WordQuestTypes";

export const WordQuestLeaderboard = () => {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    backendAPI
      .get("/leaderboard")
      .then((r) => setRows(r.data.data.rows))
      .catch(() => setFailed(true));
  }, []);

  return (
    <section className="wordquest-leaderboard" aria-labelledby="leaderboard-heading">
      <h3 className="h4" id="leaderboard-heading">Leaderboard</h3>

      {failed && <p className="p3 wordquest-error" role="alert">Could not load the leaderboard.</p>}
      {!failed && rows === null && <p className="p3" role="status">Loading…</p>}
      {rows && rows.length === 0 && <p className="p3"> <center> No one has finished a game yet. </center></p>}

      {rows && rows.length > 0 && (
        <table>
          <caption className="sr-only">Players ranked by words solved, then average guesses</caption>
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Words</th>
              <th scope="col">Avg guesses</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.displayName}-${i}`}>
                <td>{i + 1}. {row.displayName}</td>
                <td>{row.wordsCorrect}</td>
                <td>{row.averageGuesses === null ? "–" : row.averageGuesses.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};