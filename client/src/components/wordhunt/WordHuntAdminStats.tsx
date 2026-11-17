import { useEffect, useRef, useState } from "react";

// types
import { WordHuntAnalyticsResponse, WordHuntAnalyticsSummary, WordHuntMode } from "@shared/types/wordhunt/WordHuntTypes";

// utils
import { backendAPI } from "@/utils";

const RANGES = [7, 30, 90];

const formatPercent = (value: number | null) => (value === null ? "–" : `${Math.round(value * 100)}%`);
const formatNumber = (value: number | null) => (value === null ? "–" : value.toLocaleString());
const formatDuration = (seconds: number | null) =>
  seconds === null ? "–" : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
const formatDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

const SUMMARY: { label: string; value: (totals: WordHuntAnalyticsSummary) => string }[] = [
  { label: "Games started", value: (t) => formatNumber(t.gamesStarted) },
  { label: "Completion rate", value: (t) => formatPercent(t.completionRate) },
  { label: "Avg. words found", value: (t) => formatNumber(t.averageWordsFound) },
  { label: "Avg. score", value: (t) => formatNumber(t.averageScore) },
  { label: "Avg. time played", value: (t) => formatDuration(t.averageSecondsPlayed) },
  { label: "Found word of the day", value: (t) => formatPercent(t.wordOfTheDayFindRate) },
];

const GOLDEN_SUMMARY: typeof SUMMARY = [
  { label: "Avg. golden words", value: (t) => formatNumber(t.averageGoldenLetterWords) },
  { label: "Reached a goal", value: (t) => formatPercent(t.goalReachedRate) },
];

interface WordHuntAdminStatsProps {
  onBack: () => void;
}

/** Admin stats view inside the admin popup: totals for the chosen range, then a row per day. */
export const WordHuntAdminStats = ({ onBack }: WordHuntAdminStatsProps) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [days, setDays] = useState(RANGES[0]);
  // Both modes added together by default; or one mode at a time.
  const [mode, setMode] = useState<WordHuntMode | "all">("all");
  const isGolden = mode === "golden";
  const [analytics, setAnalytics] = useState<WordHuntAnalyticsResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => headingRef.current?.focus(), []);

  useEffect(() => {
    let isCurrent = true;
    setAnalytics(null);
    setError("");
    backendAPI
      .get("/wordhunt/admin/analytics", { params: { days, mode } })
      .then((response) => isCurrent && setAnalytics(response.data.data as WordHuntAnalyticsResponse))
      .catch((err) => isCurrent && setError(err?.response?.data?.error || "Couldn't load stats. Please try again."));
    return () => {
      isCurrent = false;
    };
  }, [days, mode]);

  return (
    <section className="wh-admin-stats" aria-labelledby="wh-admin-stats-title">
      <div className="wh-admin-stats-header">
        <h3 ref={headingRef} className="h4" id="wh-admin-stats-title" tabIndex={-1}>
          Word Hunt stats
        </h3>
        <label className="p3" htmlFor="wh-admin-stats-mode">
          Mode{" "}
          <select
            id="wh-admin-stats-mode"
            className="input"
            value={mode}
            onChange={(event) => setMode(event.target.value as WordHuntMode | "all")}
          >
            <option value="all">All modes</option>
            <option value="classic">Classic</option>
            <option value="golden">Golden Letter</option>
          </select>
        </label>
        <label className="p3" htmlFor="wh-admin-stats-range">
          Show{" "}
          <select
            id="wh-admin-stats-range"
            className="input"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {RANGES.map((range) => (
              <option key={range} value={range}>
                Last {range} days
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p className="p3 wh-feedback--error" role="alert">
          {error}
        </p>
      ) : !analytics ? (
        <p className="p3" role="status">
          Loading stats…
        </p>
      ) : (
        <>
          <dl className="wh-stats-summary">
            {[...SUMMARY, ...(isGolden ? GOLDEN_SUMMARY : [])].map(({ label, value }) => (
              <div key={label} className="wh-stats-summary-item">
                <dt className="p3">{label}</dt>
                <dd>{value(analytics.totals)}</dd>
              </div>
            ))}
          </dl>

          {/* Scrolls sideways on narrow screens; focusable so keyboard users can scroll it too. */}
          <div className="wh-stats-table-wrap" tabIndex={0} role="region" aria-labelledby="wh-stats-caption">
            <table className="wh-stats-table p3">
              <caption id="wh-stats-caption" className="sr-only">
                Word Hunt {mode === "all" ? "" : `${isGolden ? "Golden Letter" : "Classic"} `}stats by day, newest first
              </caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Started</th>
                  <th scope="col">Finished</th>
                  <th scope="col">Completion</th>
                  <th scope="col">Quit early</th>
                  <th scope="col">Avg. words</th>
                  <th scope="col">Avg. score</th>
                  <th scope="col">Avg. time</th>
                  <th scope="col">Found WOTD</th>
                  {isGolden && <th scope="col">Avg. golden</th>}
                  {isGolden && <th scope="col">Goal reached</th>}
                </tr>
              </thead>
              <tbody>
                {analytics.days.map((day) => (
                  <tr key={day.date}>
                    <th scope="row">{formatDate(day.date)}</th>
                    <td>{formatNumber(day.gamesStarted)}</td>
                    <td>{formatNumber(day.gamesCompleted)}</td>
                    <td>{formatPercent(day.completionRate)}</td>
                    <td>{formatPercent(day.quitRate)}</td>
                    <td>{formatNumber(day.averageWordsFound)}</td>
                    <td>{formatNumber(day.averageScore)}</td>
                    <td>{formatDuration(day.averageSecondsPlayed)}</td>
                    <td>{formatPercent(day.wordOfTheDayFindRate)}</td>
                    {isGolden && <td>{formatNumber(day.averageGoldenLetterWords)}</td>}
                    {isGolden && <td>{formatPercent(day.goalReachedRate)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="p3">
            {mode === "all" ? "Classic and Golden Letter games together. " : ""}Averages are per finished game. Admin
            replays (games after "Reset my play") aren't counted. WOTD = word of the day.
          </p>
        </>
      )}

      <div className="actions">
        <button type="button" className="btn wh-btn wh-btn--outline" onClick={onBack}>
          Back
        </button>
      </div>
    </section>
  );
};

export default WordHuntAdminStats;
