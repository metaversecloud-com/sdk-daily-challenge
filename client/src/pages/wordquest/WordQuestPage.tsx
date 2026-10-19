import { useWordle } from "../../context/wordquest/WordQuestContext";
import { WordleBoard } from "../../components/wordquest/WordQuestBoard";
import "../styles/wordquest.css";

export const WordlePage = () => {
  const { gameState, currentGuess, setCurrentGuess, submitCurrentGuess, error, loading } = useWordle();

  if (loading) return <p className="p2">Loading...</p>;
  if (!gameState) return <p className="p2">Could not load game.</p>;

  return (
    <div className="card flex flex-col items-center gap-4">
      <h1 className="h2">WordQuest</h1>

      <WordleBoard />

      {gameState.status === "playing" ? (
        <div className="flex gap-2">
          <input
            id="guess-input"
            className="input"
            value={currentGuess}
            maxLength={gameState.wordLength}
            onChange={(e) => setCurrentGuess(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && submitCurrentGuess()}
          />
          <button className="btn" onClick={submitCurrentGuess}>
            Guess
          </button>
        </div>
      ) : (
        <p className="p2" role="status">
          {gameState.status === "won" ? "You solved today's Wordle! 🎉" : "Out of guesses — come back tomorrow!"}
        </p>
      )}

      {error && (
        <p className="p3" role="alert" style={{ color: "red" }}>
          {error}
        </p>
      )}
    </div>
  );
};