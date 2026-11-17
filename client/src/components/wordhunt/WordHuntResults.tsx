import { useEffect, useRef } from "react";
import { WordHuntGame, WordHuntWordOfTheDay } from "@shared/types/wordhunt/WordHuntTypes";
import { getMedal, isGoldenWord } from "@shared/wordhunt/golden";
import { WordHuntLeaderboard } from "./WordHuntLeaderboard";
import { WordHuntWordOfTheDayPanel } from "./WordHuntWordOfTheDayPanel";

interface WordHuntResultsProps {
  game: WordHuntGame;
  wordOfTheDay: WordHuntWordOfTheDay | null;
  /** Changing this value reloads the leaderboard (e.g. after an admin clears it). */
  leaderboardRefreshKey?: string;
  /** Goes back to the start screen to pick a mode. */
  onBackToModes: () => void;
}

const MEDAL_LABELS = { bronze: "Bronze", silver: "Silver", gold: "Gold" } as const;

export const WordHuntResults = ({
  game,
  wordOfTheDay,
  leaderboardRefreshKey = "",
  onBackToModes,
}: WordHuntResultsProps) => {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the results so keyboard and screen reader users land on the summary.
  useEffect(() => headingRef.current?.focus(), []);

  const sortedWords = [...game.foundWords].sort((a, b) => b.points - a.points || a.word.localeCompare(b.word));
  const isGoldenMode = game.mode === "golden";
  const goldenLetter = game.board.goldenLetter;
  const goals = game.board.goals;
  const medal = isGoldenMode ? getMedal(game.score, goals) : null;
  const goldenWordCount = sortedWords.filter(({ word }) => isGoldenWord(word, goldenLetter)).length;

  return (
    <div className="flex flex-col gap-5">
      <h1 ref={headingRef} className="wh-title" tabIndex={-1}>
        {game.endReason === "quit" ? "Game Over" : "Time's Up!"}
      </h1>

      <div className="wh-panel text-center">
        <p className="p2">Total Points</p>
        <p className="wh-results-score">{game.score.toLocaleString()}</p>
      </div>

      {isGoldenMode && goals && (
        <div className={`wh-panel wh-medal ${medal ? `wh-medal--${medal}` : ""}`} role="status">
          <h2 className="h4">
            {medal ? (
              <>
                <span aria-hidden="true">🏅 </span>
                {MEDAL_LABELS[medal]} goal reached!
              </>
            ) : (
              "No goal reached this time"
            )}
          </h2>
          <p className="p3">
            Goals: bronze {goals.bronze.toLocaleString()}, silver {goals.silver.toLocaleString()}, gold{" "}
            {goals.gold.toLocaleString()}.{" "}
            {goldenLetter &&
              `You found ${goldenWordCount} golden ${goldenWordCount === 1 ? "word" : "words"} with ${goldenLetter.toUpperCase()}.`}
          </p>
        </div>
      )}

      {wordOfTheDay && (
        <WordHuntWordOfTheDayPanel
          wordOfTheDay={wordOfTheDay}
          wasFound={game.foundWords.some(({ word }) => word === wordOfTheDay.word)}
        />
      )}

      <div className="wh-panel">
        <h2 className="h4 mb-2">
          You found {sortedWords.length} {sortedWords.length === 1 ? "word" : "words"}
        </h2>
        {sortedWords.length > 0 ? (
          <ul className="wh-word-list p2">
            {sortedWords.map(({ word, points }) => (
              <li key={word} className={isGoldenWord(word, goldenLetter) ? "wh-word-list-golden" : undefined}>
                <span>
                  {isGoldenWord(word, goldenLetter) && (
                    <>
                      <span aria-hidden="true">★ </span>
                      <span className="sr-only">Golden word: </span>
                    </>
                  )}
                  {word.toUpperCase()}
                </span>
                <span>{points.toLocaleString()} pts</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p2">No words this time. Give it another try tomorrow!</p>
        )}
      </div>

      <WordHuntLeaderboard refreshKey={`${game.gameId}-${leaderboardRefreshKey}`} mode={game.mode ?? "classic"} />

      <p className="wh-panel p2 text-center">
        You&apos;ve played today&apos;s {isGoldenMode ? "Golden Letter" : "Classic"} board. Come back tomorrow for a new one!
      </p>
      <button type="button" className="btn wh-btn wh-btn--outline" onClick={onBackToModes}>
        Back to game modes
      </button>
    </div>
  );
};

export default WordHuntResults;
