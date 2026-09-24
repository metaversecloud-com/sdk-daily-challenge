import { LetterState } from "@shared/types/WordQuestTypes";

interface Props {
  letter: string;
  state?: LetterState;
}

const stateClass: Record<string, string> = {
  correct: "wordle-tile-correct",
  present: "wordle-tile-present",
  absent: "wordle-tile-absent",
};

export const WordleTile = ({ letter, state }: Props) => (
  <div className={`wordle-tile ${state ? stateClass[state] : ""}`} aria-label={state ? `${letter}: ${state}` : letter}>
    {letter}
  </div>
);