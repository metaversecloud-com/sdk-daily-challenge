import { WordleGameState } from "@shared/types/WordQuestTypes";
import { WordleTile } from "./WordQuestTile";

interface Props {
  gameState: WordleGameState;
  currentGuess: string;
}

export const WordleBoard = ({ gameState, currentGuess }: Props) => {
  const rows = [];
  for (let i = 0; i < gameState.maxGuesses; i++) {
    const guessRow = gameState.guesses[i];
    const isCurrentRow = i === gameState.guesses.length && gameState.status === "playing";

    let letters: string[];
    let states: (string | undefined)[];

    if (guessRow) {
      letters = guessRow.guess.split("");
      states = guessRow.feedback;
    } else if (isCurrentRow) {
      letters = currentGuess.padEnd(gameState.wordLength).split("");
      states = new Array(gameState.wordLength).fill(undefined);
    } else {
      letters = new Array(gameState.wordLength).fill("");
      states = new Array(gameState.wordLength).fill(undefined);
    }

    rows.push(
      <div className="flex gap-2" key={i}>
        {letters.map((letter, j) => (
          <WordleTile key={j} letter={letter.trim()} state={states[j] as any} />
        ))}
      </div>,
    );
  }

  return <div className="flex flex-col gap-2">{rows}</div>;
};