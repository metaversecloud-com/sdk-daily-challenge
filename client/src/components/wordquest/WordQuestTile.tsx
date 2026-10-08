import { LetterState } from "@shared/types/WordQuestTypes";

interface Props {
  letter: string;
  state?: LetterState;
}

const stateClass: Record<string, string> = {
  correct: "wordquest-tile-correct",
  present: "wordquest-tile-present",
  absent: "wordquest-tile-absent",
};

export const WordQuestTile = ({ letter, state }: Props) => (
  <div
    className={`wordquest-tile ${state ? stateClass[state] : ""}`}
    aria-label={state ? `${letter}: ${state}` : letter}
  >
    {letter}
  </div>
);