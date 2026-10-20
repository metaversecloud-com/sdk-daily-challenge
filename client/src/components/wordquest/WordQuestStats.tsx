import { WordQuestStatsData } from "@shared/types/WordQuestTypes";

export const WordQuestStats = ({ stats }: { stats: WordQuestStatsData }) => {
  const winPct = stats.gamesPlayed ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
  const maxCount = Math.max(1, ...stats.guessDistribution);

  return (
    <section className="wordquest-stats" aria-labelledby="stats-heading">
      <h2 className="h4" id="stats-heading">Statistics</h2>

      <dl className="wordquest-stats-summary">
        <div><dd>{stats.gamesPlayed}</dd><dt>Played</dt></div>
        <div><dd>{winPct}%</dd><dt>Win rate</dt></div>
        <div><dd>{stats.currentStreak}</dd><dt>Current streak</dt></div>
        <div><dd>{stats.maxStreak}</dd><dt>Max streak</dt></div>
      </dl>

      <h3 className="p2">Guess distribution</h3>
      <ol className="wordquest-dist">
        {stats.guessDistribution.map((count, i) => (
          <li key={i}>
            <span>{i + 1}</span>
            <span className="wordquest-dist-bar" style={{ width: `${(count / maxCount) * 100}%` }} />
            <span>{count}</span>
          </li>
        ))}
      </ol>
    </section>
  );
};