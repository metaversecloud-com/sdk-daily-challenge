import { WordHuntLeaderboard } from "./WordHuntLeaderboard";

interface WordHuntStartProps {
  isStarting: boolean;
  onStart: () => void;
}

export const WordHuntStart = ({ isStarting, onStart }: WordHuntStartProps) => {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="wh-title">Word Hunt</h1>
      <div className="wh-panel">
        <h2 className="h4 mb-2">How to play</h2>
        <ul className="wh-rules p2">
          <li>Drag across letters that touch (even diagonally) to make words.</li>
          <li>Words need at least 3 letters. Each letter can be used once per word.</li>
          <li>Longer words earn more points: 3 letters = 200, up to 1,400 for 8+ letters.</li>
          <li>You have 2 minutes and one game per day. There's a new board every day!</li>
        </ul>
      </div>
      <WordHuntLeaderboard />
      <button type="button" className="btn wh-btn" onClick={onStart} disabled={isStarting}>
        {isStarting ? "Starting…" : "Start Game"}
      </button>
    </div>
  );
};

export default WordHuntStart;
