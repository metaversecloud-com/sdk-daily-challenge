import type { ChallengeMode } from "@shared/types/WordQuestTypes";

export type WordQuestMode = "classic" | ChallengeMode;

const MODES: { id: WordQuestMode; title: string; description: string }[] = [
  { id: "classic", title: "Daily word", description: "One word a day. Six guesses." },
  { id: "timed", title: "Timed", description: "Solve 3 words in 3 minutes." },
  {
    id: "suddenDeath",
    title: "Sudden death",
    description: "Solve 3 words in a row. Miss one and the run is over. Fewer guesses is a better score.",
  },
];

export const WordQuestModes = ({ onSelect }: { onSelect: (mode: WordQuestMode) => void }) => (
  <div className="wordquest-modes">
    <h2 className="h4">Choose a mode</h2>
    <ul className="wordquest-mode-list">
      {MODES.map((m) => (
        <li key={m.id}>
          <button type="button" className="wordquest-mode-card" onClick={() => onSelect(m.id)}>
            <span className="wordquest-mode-title">{m.title}</span>
            <span className="wordquest-mode-desc">{m.description}</span>
          </button>
        </li>
      ))}
    </ul>
  </div>
);