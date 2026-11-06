import { KeyboardEvent, useEffect, useRef, useState } from "react";

// types
import { WordHuntGameStateResponse } from "@shared/types/wordhunt/WordHuntTypes";

// utils
import { backendAPI } from "@/utils";

type AdminAction = "clear-leaderboard" | "reset-play";

const ACTIONS: Record<AdminAction, { confirm: string; button: string; success: string; failure: string }> = {
  "clear-leaderboard": {
    confirm: "Remove every score from today's leaderboard? This can't be undone.",
    button: "Yes, clear it",
    success: "Today's leaderboard was cleared.",
    failure: "Couldn't clear the leaderboard. Please try again.",
  },
  "reset-play": {
    confirm: "Delete your game for today so you can play the board again? Your stats and badges are kept.",
    button: "Yes, reset it",
    success: "Your game for today was reset.",
    failure: "Couldn't reset your game. Please try again.",
  },
};

interface WordHuntAdminModalProps {
  onClose: () => void;
  onLeaderboardCleared: () => void;
  onPlayReset: (data: WordHuntGameStateResponse) => void;
}

/** Admin tools for testing Word Hunt. Only shown to world admins, and the server checks again on every action. */
export const WordHuntAdminModal = ({ onClose, onLeaderboardCleared, onPlayReset }: WordHuntAdminModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const actionButtonRefs = useRef<Partial<Record<AdminAction, HTMLButtonElement | null>>>({});
  // Where focus goes when the confirmation step closes: the action's button if cancelled, the heading once it ran.
  const returnFocusRef = useRef<AdminAction | "heading" | null>(null);

  const [pendingAction, setPendingAction] = useState<AdminAction | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    headingRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  // The button that had focus disappears when the view switches, so move focus to the new view.
  useEffect(() => {
    if (pendingAction) cancelRef.current?.focus();
    else if (returnFocusRef.current) {
      const target = returnFocusRef.current;
      (target === "heading" ? headingRef.current : actionButtonRefs.current[target])?.focus();
      returnFocusRef.current = null;
    }
  }, [pendingAction]);

  const askToConfirm = (action: AdminAction) => setPendingAction(action);

  const cancelConfirm = () => {
    returnFocusRef.current = pendingAction;
    setPendingAction(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (pendingAction) cancelConfirm();
      else onClose();
    } else if (event.key === "Tab") {
      // Keep focus inside the dialog.
      const focusable = [...(modalRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const runAction = async (action: AdminAction) => {
    setIsBusy(true);
    try {
      const response = await backendAPI.post(`/wordhunt/admin/${action}`);
      setStatus({ text: ACTIONS[action].success, isError: false });
      if (action === "clear-leaderboard") onLeaderboardCleared();
      else onPlayReset(response.data.data as WordHuntGameStateResponse);
    } catch (error: any) {
      setStatus({ text: error?.response?.data?.error || ACTIONS[action].failure, isError: true });
    } finally {
      setIsBusy(false);
      returnFocusRef.current = "heading";
      setPendingAction(null);
    }
  };

  return (
    <div
      className="modal-container"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wh-admin-title"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div ref={modalRef} className="modal wh-modal wh-admin" onClick={(event) => event.stopPropagation()}>
        <h2 ref={headingRef} className="h3" id="wh-admin-title" tabIndex={-1}>
          Admin tools
        </h2>
        <p className="p3">Only world admins can see these.</p>

        {pendingAction ? (
          <div className="wh-admin-confirm">
            <p className="p2" id="wh-admin-confirm-message">
              {ACTIONS[pendingAction].confirm}
            </p>
            <div className="actions">
              <button
                ref={cancelRef}
                type="button"
                className="btn wh-btn wh-btn--outline"
                onClick={cancelConfirm}
                disabled={isBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                aria-describedby="wh-admin-confirm-message"
                onClick={() => runAction(pendingAction)}
                disabled={isBusy}
              >
                {isBusy ? "Working…" : ACTIONS[pendingAction].button}
              </button>
            </div>
          </div>
        ) : (
          <>
            <section className="wh-admin-section" aria-labelledby="wh-admin-leaderboard">
              <h3 className="h4" id="wh-admin-leaderboard">
                Today's leaderboard
              </h3>
              <p className="p3">Remove every score from today's leaderboard.</p>
              <button
                ref={(el) => (actionButtonRefs.current["clear-leaderboard"] = el)}
                type="button"
                className="btn btn-danger"
                onClick={() => askToConfirm("clear-leaderboard")}
              >
                Clear leaderboard
              </button>
            </section>

            <section className="wh-admin-section" aria-labelledby="wh-admin-play">
              <h3 className="h4" id="wh-admin-play">
                Your game today
              </h3>
              <p className="p3">Delete your game for today so you can test the board again.</p>
              <button
                ref={(el) => (actionButtonRefs.current["reset-play"] = el)}
                type="button"
                className="btn wh-btn"
                onClick={() => askToConfirm("reset-play")}
              >
                Reset my play
              </button>
            </section>

            <div className="actions">
              <button type="button" className="btn wh-btn wh-btn--outline" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}

        <p className={`p3 wh-admin-status ${status?.isError ? "wh-feedback--error" : ""}`} role="status">
          {status?.text}
        </p>
      </div>
    </div>
  );
};

export default WordHuntAdminModal;
