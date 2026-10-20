import { useEffect, useRef } from "react";

import { WordQuestStatsData } from "@shared/types/WordQuestTypes";
import { WordQuestStats } from "./WordQuestStats";
import { WordQuestLeaderboard } from "./wordQuestLeaderboard";

interface Props {
  stats: WordQuestStatsData;
  onClose: () => void;
}

export const WordQuestStatsModal = ({ stats, onClose }: Props) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Remember what had focus so we can give it back on close
    const previouslyFocused = document.activeElement as HTMLElement | null;
    backRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Keep Tab inside the dialog
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>("button, [href], input, [tabindex]:not([tabindex='-1'])");
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="wordquest-modal-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className="wordquest-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stats-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <WordQuestStats stats={stats} />
        <WordQuestLeaderboard />
        <button ref={backRef} type="button" className="btn wordquest-guess-btn wordquest-modal-back" onClick={onClose}>
          Go back
        </button>
      </div>
    </div>
  );
};