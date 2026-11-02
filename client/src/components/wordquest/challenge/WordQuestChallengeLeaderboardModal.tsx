import { useEffect, useRef, useState } from "react";
import type { ChallengeGameState, ChallengeMode } from "@shared/types/WordQuestTypes";
import { WordQuestChallengeLeaderboard } from "./WordQuestChallengeLeaderboard";

interface Props {
  mode: ChallengeMode;
  refreshKey: string;
  state: ChallengeGameState | null;
  resultHeading: string;
  wordLabel: (i: number) => string;
  onClose: () => void;
}

export const WordQuestChallengeLeaderboardModal = ({
  mode,
  refreshKey,
  state,
  resultHeading,
  wordLabel,
  onClose,
}: Props) => {
  const hasResult = !!state?.words && !!state.score;
  const [tab, setTab] = useState<"results" | "leaderboard">(hasResult ? "results" : "leaderboard");
  const dialogRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Move focus into the dialog, and give it back when it closes
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    backRef.current?.focus();
    return () => previouslyFocused.current?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="wordquest-lbmodal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="wordquest-lbmodal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wordquest-lbmodal-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
       <button ref={backRef} type="button" className="wordquest-back-btn" onClick={onClose}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
          <path
            d="M19 12H5M12 5l-7 7 7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Go back
      </button>

        {hasResult ? (
          <div className="wh-tabs" role="tablist">
            {(["results", "leaderboard"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={tab === t ? "wh-tab wh-tab--active" : "wh-tab"}
                onClick={() => setTab(t)}
              >
                {t === "results" ? "Results" : "Leaderboard"}
              </button>
            ))}
          </div>
        ) : (
          <h2 className="h4" id="wordquest-lbmodal-title">
            Leaderboard
          </h2>
        )}

        {hasResult && tab === "results" && state?.words && state.score ? (
          <div role="tabpanel">
            <h2 className="h4" id="wordquest-lbmodal-title">
              {resultHeading}
            </h2>
            <p className="p3">
              {state.score.wordsSolved} of {state.wordCount} solved in {state.score.totalGuesses}{" "}
              {state.score.totalGuesses === 1 ? "guess" : "guesses"}
            </p>
            <ul className="wh-word-list">
              {state.words.map((word, i) => (
                <li key={word}>
                  <strong>{word}</strong>
                  <span>{wordLabel(i)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <WordQuestChallengeLeaderboard mode={mode} refreshKey={refreshKey} showHeading={false} />
        )}
      </div>
    </div>
  );
};