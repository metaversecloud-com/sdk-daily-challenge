import { useContext, useEffect, useState } from "react";

import { PageContainer } from "@/components";
import { GlobalStateContext } from "@/context/GlobalContext";
import { backendAPI } from "@/utils";
import { WordleGameState } from "@shared/types/WordQuestTypes";
import { WordleBoard } from "@/components/wordquest/WordQuestBoard";
import "@/styles/wordquest/wordquest.css";

export const Home = () => {
  const { hasInteractiveParams } = useContext(GlobalStateContext);

  const [gameState, setGameStateLocal] = useState<WordleGameState | null>(null);
  const [currentGuess, setCurrentGuess] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (hasInteractiveParams) {
      backendAPI
        .get("/game-state")
        .then((response) => setGameStateLocal(response.data.data))
        .catch((err) => setError(err?.response?.data?.error || "Failed to load."))
        .finally(() => setIsLoading(false));
    }
  }, [hasInteractiveParams]);

  const handleSubmitGuess = async () => {
    if (!gameState) return;
    try {
      const response = await backendAPI.post("/guess", { guess: currentGuess });
      setGameStateLocal(response.data.data);
      setCurrentGuess("");
      setError(null);
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
    } catch (err: any) {
      setError(err?.response?.data?.error || "Reset failed.");
    }
  };

  return (
    <PageContainer isLoading={isLoading} headerText="WordQuest">
      {gameState && (
        <div className="flex flex-col items-center gap-4 w-full">
          {/* DEV ONLY — remove before shipping */}
          <button type="button" className="btn btn-outline" onClick={handleReset}>
            Reset (dev)
          </button>

          <WordleBoard gameState={gameState} currentGuess={currentGuess} />

          {gameState.status === "playing" ? (
            <div className="flex gap-2 items-center">
              <label htmlFor="guess-input" className="sr-only">
                Enter your guess
              </label>
              <input
                id="guess-input"
                className="input"
                value={currentGuess}
                maxLength={gameState.wordLength}
                onChange={(e) => setCurrentGuess(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && handleSubmitGuess()}
              />
              <button type="button" className="btn" onClick={handleSubmitGuess}>
                Guess
              </button>
            </div>
          ) : (
            <p className="p2" role="status">
              {gameState.status === "won" ? "You solved it! 🎉" : "Out of guesses today."}
            </p>
          )}

          {error && (
            <p className="p3" role="alert" style={{ color: "red" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </PageContainer>
  );
};

export default Home;