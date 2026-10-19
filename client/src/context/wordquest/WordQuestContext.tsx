import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { WordleGameState } from "@shared/types/WordQuestTypes";
import { fetchGameState, submitGuess } from "../../utils/wordquest/WordQuestAPI";

interface WordleContextValue {
  gameState: WordleGameState | null;
  currentGuess: string;
  setCurrentGuess: (val: string) => void;
  submitCurrentGuess: () => Promise<void>;
  error: string | null;
  loading: boolean;
}

const WordleContext = createContext<WordleContextValue | undefined>(undefined);

export const WordleProvider = ({ children }: { children: ReactNode }) => {
  const [gameState, setGameState] = useState<WordleGameState | null>(null);
  const [currentGuess, setCurrentGuess] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGameState()
      .then(setGameState)
      .catch(() => setError("Failed to load game."))
      .finally(() => setLoading(false));
  }, []);

  const submitCurrentGuess = async () => {
    if (!gameState || gameState.status !== "playing") return;
    if (currentGuess.length !== gameState.wordLength) {
      setError(`Guess must be ${gameState.wordLength} letters.`);
      return;
    }
    try {
      const updated = await submitGuess(currentGuess);
      setGameState(updated);
      setCurrentGuess("");
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Something went wrong.");
    }
  };

  return (
    <WordleContext.Provider value={{ gameState, currentGuess, setCurrentGuess, submitCurrentGuess, error, loading }}>
      {children}
    </WordleContext.Provider>
  );
};

export const useWordle = () => {
  const ctx = useContext(WordleContext);
  if (!ctx) throw new Error("useWordle must be used within WordleProvider");
  return ctx;
};