import { useContext, useEffect, useState } from "react";

import { PageContainer } from "@/components";
import { GlobalStateContext, GlobalDispatchContext} from "@/context/GlobalContext";
import { backendAPI, setGameState} from "@/utils";
import { WordQuestGameState } from "@shared/types/WordQuestTypes";
import { WordQuestBoard } from "@/components/wordquest/WordQuestBoard";
import { WordQuestStatsModal } from "@/components/wordquest/WordQuestStatsModal";
import "@/styles/wordquest/wordquest.css";
import { loadAnswerList } from "@/components/wordquest/answerListCache";


export const Home = () => {
  const { hasInteractiveParams } = useContext(GlobalStateContext);

  const [gameState, setGameStateLocal] = useState<WordQuestGameState | null>(null);
  const [currentGuess, setCurrentGuess] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const dispatch = useContext(GlobalDispatchContext);

useEffect(() => {
  if (hasInteractiveParams) {
    backendAPI
      .get("/game-state")
      .then((response) => {
        console.log("isAdmin from server:", response.data.data.isAdmin);
        setGameStateLocal(response.data.data);
        // Makes PageContainer show the admin gear button
        setGameState(dispatch, { isAdmin: !!response.data.data.isAdmin });
        // Warm the cache so the admin panel opens instantly
        if (response.data.data.isAdmin) loadAnswerList().catch(() => {});
      })
      .catch((err) => setError(err?.response?.data?.error || "Failed to load."))
      .finally(() => setIsLoading(false));
  }
}, [hasInteractiveParams]);

// Type on the physical keyboard; the letters show on the board
useEffect(() => {
  if (!gameState || gameState.status !== "playing" || showStats) return;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === "Enter") {
      // If a button has focus, let its own click handle Enter so it doesn't submit twice
      if ((e.target as HTMLElement)?.tagName === "BUTTON") return;
      if (currentGuess.length === gameState.wordLength) handleSubmitGuess();
    } else if (e.key === "Backspace") {
      setCurrentGuess((g) => g.slice(0, -1));
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      setCurrentGuess((g) => (g.length < gameState.wordLength ? g + e.key.toUpperCase() : g));
    } else {
      return;
    }
    if (error) setError(null);
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [gameState, currentGuess, showStats, error]);

  const handleSubmitGuess = async () => {
    if (!gameState) return;
    try {
      const response = await backendAPI.post("/guess", { guess: currentGuess });
      const next: WordQuestGameState = response.data.data;
      setGameStateLocal(next);
      setCurrentGuess("");
      setError(null);
      // Open stats automatically when the game just ended
      if (next.status !== "playing") setShowStats(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Something went wrong.");
    }
  };

  const handleReset = async () => {
    try {
      const response = await backendAPI.post("/reset");
      setGameStateLocal(response.data.data);
      setCurrentGuess("");
      setError(null);
      setShowStats(false);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Reset failed.");
    }
  };

  return (
    <PageContainer isLoading={isLoading} headerText="WordQuest">
      {error && !gameState && (
        <p className="p3 wordquest-error" role="alert">
          {error}
        </p>
      )}
      {gameState && (
        <div className="flex flex-col items-center gap-4 w-full">
          <WordQuestBoard gameState={gameState} currentGuess={currentGuess} />

         {gameState.status === "playing" && (
          <div className="flex flex-col items-center gap-2">
            <p className="p3 sr-only" aria-live="polite">
              Current guess: {currentGuess || "empty"}
            </p>
            <p className="p3">Type your guess, then press Enter.</p>
            <button
              type="button"
              className="btn wordquest-guess-btn"
              disabled={currentGuess.length !== gameState.wordLength}
              onClick={handleSubmitGuess}
            >
              Guess
            </button>
          </div>
        )}

          <button type="button" className="btn wordquest-stats-btn" onClick={() => setShowStats(true)}>
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
            Stats
          </button>

          {error && (
            <p className="p3" role="alert" style={{ color: "red" }}>
              {error}
            </p>
          )}

          {/* DEV ONLY — remove before shipping */}
          <button type="button" className="btn btn-outline" onClick={handleReset}>
            Reset (dev)
          </button>
        </div>
      )}

      {showStats && gameState && (
        <WordQuestStatsModal
          stats={gameState.stats}
          status={gameState.status}
          targetWord={gameState.targetWord}
          onClose={() => setShowStats(false)}
        />
      )}


    </PageContainer>
  );
};

export default Home;