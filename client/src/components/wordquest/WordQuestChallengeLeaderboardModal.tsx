import { useEffect, useRef } from "react";
import type { ChallengeMode } from "@shared/types/WordQuestTypes";
import { WordQuestChallengeLeaderboard } from "./WordQuestChallengeLeaderboard";

interface Props {
  mode: ChallengeMode;
  refreshKey: string;
  onClose: () => void;
}

export const WordQuestChallengeLeaderboardModal = ({ mode, refreshKey, onClose }: Props) => {
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
        <button ref={backRef} type="button" className="btn btn-outline" onClick={onClose}>
          Go back
        </button>
        <h2 className="h4" id="wordquest-lbmodal-title">
          Leaderboard
        </h2>
        <WordQuestChallengeLeaderboard mode={mode} refreshKey={refreshKey} showHeading={false} />
      </div>
    </div>
  );
};