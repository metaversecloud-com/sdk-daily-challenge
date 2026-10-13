import { useEffect, useRef } from "react";
import { WordHuntGame } from "@shared/types/wordhunt/WordHuntTypes";

interface WordHuntResultsProps {
  game: WordHuntGame;
  isStarting: boolean;
  onPlayAgain: () => void;
}

export const WordHuntResults = ({ game, isStarting, onPlayAgain }: WordHuntResultsProps) => {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the results so keyboard and screen reader users land on the summary.
  useEffect(() => headingRef.current?.focus(), []);

  const sortedWords = [...game.foundWords].sort((a, b) => b.points - a.points || a.word.localeCompare(b.word));

  return (
    <div className="flex flex-col gap-5">
      <h1 ref={headingRef} className="wh-title" tabIndex={-1}>
        {game.endReason === "quit" ? "Game Over" : "Time's Up!"}
      </h1>

      <div className="wh-panel text-center">
        <p className="p2">Total Points</p>
        <p className="wh-results-score">{game.score.toLocaleString()}</p>
      </div>

      <div className="wh-panel">
        <h2 className="h4 mb-2">
          You found {sortedWords.length} {sortedWords.length === 1 ? "word" : "words"}
        </h2>
        {sortedWords.length > 0 ? (
          <ul className="wh-word-list p2">
            {sortedWords.map(({ word, points }) => (
              <li key={word}>
                <span>{word.toUpperCase()}</span>
                <span>{points.toLocaleString()} pts</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p2">No words this time. Give it another try!</p>
        )}
      </div>

      <button type="button" className="btn wh-btn" onClick={onPlayAgain} disabled={isStarting}>
        {isStarting ? "Starting…" : "Play Again"}
      </button>
    </div>
  );
};

export default WordHuntResults;
