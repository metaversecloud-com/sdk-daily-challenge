import { useContext, useEffect, useState, useRef} from "react";
import { PageContainer } from "@/components";
import { GlobalStateContext, GlobalDispatchContext } from "@/context/GlobalContext";
import { backendAPI, setGameState } from "@/utils";
import { WordQuestGameState } from "@shared/types/WordQuestTypes";
import { WordQuestBoard } from "@/components/wordquest/WordQuestBoard";
import { WordQuestStatsModal } from "@/components/wordquest/stats/WordQuestStatsModal";
import { WordQuestModes, WordQuestMode } from "@/components/wordquest/WordQuestModes";
import { WordQuestChallenge } from "@/components/wordquest/challenge/WordQuestChallenge";
import "@/styles/wordquest/wordquest.css";
import { loadAnswerList } from "@/components/wordquest/answerListCache";
import { WordQuestBackButton } from "@/components/wordquest/WordQuestBackButton";
import { WordQuestModeResults } from "@/components/wordquest/challenge/WordQuestModeResults";


export const Home = () => {
  const { hasInteractiveParams } = useContext(GlobalStateContext);
  const dispatch = useContext(GlobalDispatchContext);

  const [gameState, setGameStateLocal] = useState<WordQuestGameState | null>(null);
  const [currentGuess, setCurrentGuess] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [mode, setMode] = useState<WordQuestMode | null>(null);
  const [resultsMode, setResultsMode] = useState<"timed" | "oneshot" | null>(null);
  const submitting = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (hasInteractiveParams) {
      backendAPI
        .get("/game-state", { params: { game: "wordquest" } })
        .then((response) => {
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

  // Type on the physical keyboard; the letters show on the board (daily game only)
  useEffect(() => {
    if (mode !== "classic" || !gameState || gameState.status !== "playing" || showStats) return;

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
  }, [mode, gameState, currentGuess, showStats, error]);

  // Errors fade out on their own after a moment
  useEffect(() => {
    if (!error || !gameState) return;
    const timer = setTimeout(() => setError(null), 2500);
    return () => clearTimeout(timer);
  }, [error, gameState]);
  
    // The server grants badges before it answers the last guess, so one refetch picks up new ones
  const refreshBadges = async () => {
    try {
      const response = await backendAPI.get("/game-state", { params: { game: "wordquest" } });
      const { badges, visitorInventory } = response.data.data;
      setGameStateLocal((g) => (g ? { ...g, badges, visitorInventory } : g));
    } catch {
      /* the badges tab just keeps what it had */
    }
  };
  const handleSubmitGuess = async () => {
    if (!gameState || submitting.current) return;
    submitting.current = true;
    setIsSubmitting(true);
    try {
      const response = await backendAPI.post("/wordquest/guess", { guess: currentGuess });
      const next: WordQuestGameState = response.data.data;
      setGameStateLocal(next);
      setCurrentGuess("");
      setError(null);
      // Open stats automatically when the game just ended
      if (next.status !== "playing") {
        setShowStats(true);
        refreshBadges();
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Something went wrong.");
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    try {
      const response = await backendAPI.post("/wordquest/reset");
      setGameStateLocal(response.data.data);
      setCurrentGuess("");
      setError(null);
      setShowStats(false);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Reset failed.");
    }
  };

  const handleResults = (m: WordQuestMode) => {
    if (m === "classic") setShowStats(true);
    else setResultsMode(m);
  };

  const backToModes = () => {
    setCurrentGuess("");
    setError(null);
    setShowStats(false);
    setMode(null);
     refreshBadges();
  };

  return (
    <PageContainer isLoading={isLoading} headerText="WordQuest">
      {error && !gameState && (
        <p className="p3 wordquest-error" role="alert">
          {error}
        </p>
      )}

      {gameState && mode === null && <WordQuestModes
        onSelect={setMode}
        onResults={handleResults}
        badges={gameState.badges}
        ownedBadges={gameState.visitorInventory?.badges}
      />}

      {(mode === "timed" || mode === "oneshot") && (
        <WordQuestChallenge key={mode} mode={mode} onBack={backToModes} />
      )}

      {gameState && mode === "classic" && (
        <div className="flex flex-col items-center gap-4 w-full">
          <WordQuestBackButton onClick={backToModes} />
  
          <div className="wordquest-board-wrap">
            <WordQuestBoard gameState={gameState} currentGuess={currentGuess} />
            <div className="wordquest-message" role="alert">
              {error && <p className="p3 wordquest-error-chip">{error}</p>}
            </div>
          </div>

          {gameState.status === "playing" && (
            <div className="flex flex-col items-center gap-2">
              <p className="p3 sr-only" aria-live="polite">
                Current guess: {currentGuess || "empty"}
              </p>
              <p className="p3">Type your guess, then press Enter.</p>
              <button
                type="button"
                className="btn wordquest-guess-btn"
                disabled={currentGuess.length !== gameState.wordLength || isSubmitting}
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

          {/* DEV ONLY — remove before shipping */}
          {gameState.isAdmin && (
            <button type="button" className="btn btn-outline" onClick={handleReset}>
              Reset (dev)
            </button>
          )}
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

      {resultsMode && <WordQuestModeResults mode={resultsMode} onClose={() => setResultsMode(null)} />}
    </PageContainer>
  );
};

export default Home;