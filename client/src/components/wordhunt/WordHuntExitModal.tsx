import { KeyboardEvent, useEffect, useRef } from "react";

interface WordHuntExitModalProps {
  onConfirm: () => void;
  onClose: () => void;
}

export const WordHuntExitModal = ({ onConfirm, onClose }: WordHuntExitModalProps) => {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    } else if (event.key === "Tab") {
      // Trap focus between the two buttons.
      event.preventDefault();
      const next = document.activeElement === cancelButtonRef.current ? confirmButtonRef : cancelButtonRef;
      next.current?.focus();
    }
  };

  return (
    <div
      className="modal-container"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wh-exit-title"
      aria-describedby="wh-exit-message"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div className="modal wh-modal" onClick={(event) => event.stopPropagation()}>
        <h2 className="h3" id="wh-exit-title">
          End game early?
        </h2>
        <p className="p2" id="wh-exit-message">
          You'll keep the points and words you've found so far.
        </p>
        <div className="actions">
          <button ref={cancelButtonRef} type="button" className="btn wh-btn wh-btn--outline" onClick={onClose}>
            Keep playing
          </button>
          <button ref={confirmButtonRef} type="button" className="btn wh-btn" onClick={onConfirm}>
            End game
          </button>
        </div>
      </div>
    </div>
  );
};

export default WordHuntExitModal;
