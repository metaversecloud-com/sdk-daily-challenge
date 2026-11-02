import { useCallback, useEffect, useRef, useState } from "react";
import { backendAPI } from "@/utils";
import type { ChallengeGameState, ChallengeMode, WordQuestGameState } from "@shared/types/WordQuestTypes";
import { WordQuestBoard } from "../WordQuestBoard";
import { WordQuestChallengeLeaderboardModal } from "./WordQuestChallengeLeaderboardModal";

const TITLES: Record<ChallengeMode, string> = { timed: "Timed", suddenDeath: "Sudden death" };
const WARNING_SECONDS = [60, 30, 10];

const formatTime = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

interface Props {
  mode: ChallengeMode;
  onBack: () => void;
}

export const WordQuestChallenge = ({ mode, onBack }: Props) => {
  const [state, setState] = useState<ChallengeGameState | null>(null);
  const [currentGuess, setCurrentGuess] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [clockOffset, setClockOffset] = useState(0); // server time minus browser time
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const announced = useRef<Set<number>>(new Set());

  const applyState = useCallback((next: ChallengeGameState) => {
    setState(next);
    setClockOffset(next.serverTime - Date.now());
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await backendAPI.get("/game-state", { params: { game: "wordquest", mode } });
      applyState(response.data.data);
    } catch (err) {
      setError((err as any)?.response?.data?.error || "Failed to load.");
    } finally {
      setIsLoading(false);
    }
  }, [mode, applyState]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStart = async () => {
    setIsBusy(true);
    try {
      const response = await backendAPI.post("/wordquest/challenge/start", { mode });
      applyState(response.data.data);
      setError(null);
    } catch (err) {
      setError((err as any)?.response?.data?.error || "Could not start.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmitGuess = async () => {
    if (!state || isBusy) return;
    setIsBusy(true);
    try {
      const response = await backendAPI.post("/wordquest/challenge/guess", { mode, guess: currentGuess });
      applyState(response.data.data);
      setCurrentGuess("");
      setError(null);
    } catch (err) {
      setError((err as any)?.response?.data?.error || "Something went wrong.");
    } finally {
      setIsBusy(false);
    }
  };

  // Countdown for timed mode. When it reaches zero, ask the server, which decides.
  useEffect(() => {
    if (!state || state.status !== "playing" || state.endsAt === null) {
      setRemainingMs(null);
      return;
    }
    const endsAt = state.endsAt;
    const tick = () => {
      const left = endsAt - (Date.now() + clockOffset);
      setRemainingMs(Math.max(0, left));

      // Announce each warning once; if we load past several, announce only the smallest
      const crossed = WARNING_SECONDS.filter((s) => left <= s * 1000 && !announced.current.has(s));
      if (crossed.length) {
        crossed.forEach((s) => announced.current.add(s));
        setAnnouncement(`${Math.min(...crossed)} seconds left`);
      }

      if (left < -300) {
        clearInterval(id);
        load();
      }
    };
    const id = setInterval(tick, 250);
    tick();
    return () => clearInterval(id);
  }, [state, clockOffset, load]);

  // Type on the physical keyboard (paused while the leaderboard popup is open)
  useEffect(() => {
    if (!state || state.status !== "playing" || showLeaderboard) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Enter") {
        if ((e.target as HTMLElement)?.tagName === "BUTTON") return;
        if (currentGuess.length === state.wordLength) handleSubmitGuess();
      } else if (e.key === "Backspace") {
        setCurrentGuess((g) => g.slice(0, -1));
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        setCurrentGuess((g) => (g.length < state.wordLength ? g + e.key.toUpperCase() : g));
      } else {
        return;
      }
      if (error) setError(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state, currentGuess, error, isBusy, showLeaderboard]);

  if (isLoading) return <p className="p3">Loading...</p>;

  const title = TITLES[mode];

  const resultHeading = () => {
    if (!state) return "";
    if (state.status === "timeout") return "Time's up";
    if (state.status === "failed") return "Run over";
    return state.score?.wordsSolved === state.wordCount ? "All words solved!" : "Run complete";
  };

  const wordLabel = (i: number) => {
    if (!state) return "";
    if (state.solved[i]) return "Solved";
    if (i > state.wordIndex) return "Not reached";
    if (i === state.wordIndex && state.status === "timeout") return "Out of time";
    return "Missed";
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <button type="button" className="btn btn-outline" onClick={onBack}>
        All modes
      </button>
      <h2 className="h4">{title}</h2>

      {error && (
        <p className="p3 wordquest-error" role="alert">
          {error}
        </p>
      )}

      {state?.status === "notStarted" && (
        <div className="wordquest-challenge-intro">
          <p className="p3">
            {mode === "timed"
              ? `Solve ${state.wordCount} words in 3 minutes. The clock starts when you press Start.`
              : `Solve ${state.wordCount} words in a row. Miss one and the run is over. Fewer guesses is a better score.`}
          </p>
          <p className="p3">You get one attempt per day.</p>
          <button type="button" className="btn wordquest-guess-btn" onClick={handleStart} disabled={isBusy}>
            Start
          </button>
        </div>
      )}

      {state && state.status !== "notStarted" && (
        <>
          <div className="wordquest-progress">
            <p className="p3 sr-only" aria-live="polite">
              {state.status === "playing" ? `Word ${state.wordIndex + 1} of ${state.wordCount}` : resultHeading()}
            </p>
            <ol className="wordquest-progress-list" aria-label="Progress">
              {Array.from({ length: state.wordCount }, (_, i) => (
                <li
                  key={i}
                  className={
                    state.solved[i]
                      ? "wordquest-progress-item is-solved"
                      : i === state.wordIndex && state.status === "playing"
                        ? "wordquest-progress-item is-current"
                        : "wordquest-progress-item"
                  }
                >
                  <span className="sr-only">{`Word ${i + 1}: ${state.status === "playing" && i === state.wordIndex ? "current" : wordLabel(i)}`}</span>
                  <span aria-hidden="true">{i + 1}</span>
                </li>
              ))}
            </ol>

            {remainingMs !== null && (
              <>
                <p className="wordquest-timer" role="timer" aria-live="off">
                  <span className="sr-only">Time left: </span>
                  {formatTime(remainingMs)}
                </p>
                <p className="sr-only" aria-live="polite">
                  {announcement}
                </p>
              </>
            )}
          </div>

          <WordQuestBoard
            gameState={
              {
                guesses: state.guesses,
                status: "playing",
                maxGuesses: state.maxGuesses,
                wordLength: state.wordLength,
              } as WordQuestGameState
            }
            currentGuess={state.status === "playing" ? currentGuess : ""}
          />

          {state.status === "playing" && (
            <div className="flex flex-col items-center gap-2">
              <p className="p3 sr-only" aria-live="polite">
                Current guess: {currentGuess || "empty"}
              </p>
              <p className="p3">Type your guess, then press Enter.</p>
              <button
                type="button"
                className="btn wordquest-guess-btn"
                disabled={currentGuess.length !== state.wordLength || isBusy}
                onClick={handleSubmitGuess}
              >
                Guess
              </button>
            </div>
          )}

          {state.status !== "playing" && state.words && state.score && (
            <section className="wordquest-result" aria-label="Result">
              <h3 className="h4">{resultHeading()}</h3>
              <p className="p3">
                {state.score.wordsSolved} of {state.wordCount} solved in {state.score.totalGuesses}{" "}
                {state.score.totalGuesses === 1 ? "guess" : "guesses"}
                {state.score.timeLeftMs !== null && `, ${formatTime(state.score.timeLeftMs)} left`}
              </p>
              <ul className="wordquest-result-words">
                {state.words.map((word, i) => (
                  <li key={word}>
                    <strong>{word}</strong> — {wordLabel(i)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <button type="button" className="btn wordquest-stats-btn" onClick={() => setShowLeaderboard(true)}>
        <svg
          className="wordquest-stats-icon"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="3" y="12" width="4" height="9" rx="1" fill="currentColor" />
          <rect x="10" y="4" width="4" height="17" rx="1" fill="currentColor" />
          <rect x="17" y="9" width="4" height="12" rx="1" fill="currentColor" />
        </svg>
        Leaderboard
      </button>

      {showLeaderboard && (
        <WordQuestChallengeLeaderboardModal
          mode={mode}
          refreshKey={state?.status ?? "none"}
          onClose={() => setShowLeaderboard(false)}
        />
      )}
    </div>
  );
};