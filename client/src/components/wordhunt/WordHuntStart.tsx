import { KeyboardEvent, useRef } from "react";

// components
import { WordHuntLeaderboard } from "./WordHuntLeaderboard";

// types
import { WordHuntBoard, WordHuntMode, WordHuntModeStatus } from "@shared/types/wordhunt/WordHuntTypes";

const MODES: { id: WordHuntMode; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "golden", label: "Golden Letter" },
];

interface WordHuntStartProps {
  mode: WordHuntMode;
  onModeChange: (mode: WordHuntMode) => void;
  /** Today's board for the selected mode (golden boards carry the golden letter and goals). */
  board: WordHuntBoard | null;
  /** Today's status in each mode. */
  modes: Record<WordHuntMode, WordHuntModeStatus> | null;
  isStarting: boolean;
  /** Starts (or resumes) today's game in the selected mode. */
  onStart: () => void;
  /** Shows today's results in the selected mode (once it has been played). */
  onViewResults: () => void;
  /** Changing this value reloads the leaderboard (e.g. after an admin clears it). */
  leaderboardRefreshKey?: string;
}

export const WordHuntStart = ({
  mode,
  onModeChange,
  board,
  modes,
  isStarting,
  onStart,
  onViewResults,
  leaderboardRefreshKey,
}: WordHuntStartProps) => {
  const modeButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const status = modes?.[mode] ?? "not_started";
  const isGolden = mode === "golden";

  // Arrow keys move between the two modes, like other radio groups.
  const handleModeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const index = MODES.findIndex(({ id }) => id === mode);
    const next = (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + MODES.length) % MODES.length;
    onModeChange(MODES[next].id);
    modeButtonRefs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="wh-title">Word Hunt</h1>

      <div className="wh-mode-picker" role="radiogroup" aria-label="Game mode" onKeyDown={handleModeKeyDown}>
        {MODES.map(({ id, label }, index) => (
          <button
            key={id}
            ref={(el) => (modeButtonRefs.current[index] = el)}
            type="button"
            role="radio"
            aria-checked={mode === id}
            tabIndex={mode === id ? 0 : -1}
            className={`wh-mode ${mode === id ? "wh-mode--active" : ""}`}
            onClick={() => onModeChange(id)}
          >
            {id === "golden" && <span aria-hidden="true">★ </span>}
            {label}
            {modes?.[id] === "finished" && <span className="wh-mode-done"> ✓ Played</span>}
          </button>
        ))}
      </div>

      {isGolden && board?.goldenLetter && (
        <div className="wh-panel wh-golden-intro">
          <p className="p2">Today&apos;s golden letter</p>
          <p className="wh-golden-letter" aria-label={`Today's golden letter is ${board.goldenLetter.toUpperCase()}`}>
            {board.goldenLetter.toUpperCase()}
          </p>
          {board.goals && (
            <dl className="wh-goals" aria-label="Score goals">
              <div className="wh-goal wh-goal--bronze">
                <dt>Bronze</dt>
                <dd>{board.goals.bronze.toLocaleString()}</dd>
              </div>
              <div className="wh-goal wh-goal--silver">
                <dt>Silver</dt>
                <dd>{board.goals.silver.toLocaleString()}</dd>
              </div>
              <div className="wh-goal wh-goal--gold">
                <dt>Gold</dt>
                <dd>{board.goals.gold.toLocaleString()}</dd>
              </div>
            </dl>
          )}
        </div>
      )}

      <div className="wh-panel">
        <h2 className="h4 mb-2">How to play</h2>
        <ul className="wh-rules p2">
          <li>Drag across letters that touch (even diagonally) to make words.</li>
          <li>Words need at least 3 letters. Each letter can be used once per word.</li>
          {isGolden ? (
            <>
              <li>Words with the golden letter score double. Golden tiles are marked with a ★.</li>
              <li>Find golden words in a row for an even bigger bonus: ×2, ×2.5, ×3, ×3.5, up to ×4.</li>
              <li>Reach the bronze, silver, or gold goal before time runs out!</li>
              <li>Golden Letter games earn the Golden Letter badges (Classic badges come from Classic games).</li>
            </>
          ) : (
            <li>Longer words earn more points: 3 letters = 200, up to 1,400 for 8+ letters.</li>
          )}
          <li>You have 2 minutes and one game per mode each day. There&apos;s a new board every day!</li>
        </ul>
      </div>

      <WordHuntLeaderboard refreshKey={leaderboardRefreshKey} mode={mode} />

      {status === "finished" ? (
        <button type="button" className="btn wh-btn" onClick={onViewResults}>
          View today&apos;s results
        </button>
      ) : (
        <button type="button" className="btn wh-btn" onClick={onStart} disabled={isStarting}>
          {isStarting ? "Starting…" : status === "in_progress" ? "Resume Game" : isGolden ? "Start Golden Game" : "Start Game"}
        </button>
      )}
    </div>
  );
};

export default WordHuntStart;
