import { useState } from "react";
import type { BadgeType } from "@shared/types/WordQuestTypes";
import { WordQuestBadges } from "./WordQuestBadges";

export type WordQuestMode = "classic" | "timed" | "suddenDeath";

const MODES: { id: WordQuestMode; title: string; description: string }[] = [
  { id: "classic", title: "Daily word", description: "One word a day. Six guesses." },
  { id: "timed", title: "Timed", description: "Solve 3 words in 3 minutes." },
  {
    id: "suddenDeath",
    title: "One Shot",
    description: "Solve 3 words in a row. One miss ends the run",
  },
];

interface Props {
  onSelect: (mode: WordQuestMode) => void;
  onResults: (mode: WordQuestMode) => void;
  badges?: Record<string, BadgeType>;
  ownedBadges?: Record<string, unknown>;
}

export const WordQuestModes = ({ onSelect, onResults, badges, ownedBadges }: Props) => {
  const [tab, setTab] = useState<"play" | "badges">("play");

  return (
    <div className="wordquest-modes">
      <div className="wh-tabs" role="tablist">
        {(["play", "badges"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "wh-tab wh-tab--active" : "wh-tab"}
            onClick={() => setTab(t)}
          >
            {t === "play" ? "Play" : "Badges"}
          </button>
        ))}
      </div>

      {tab === "play" ? (
        <div role="tabpanel">
          <h2 className="h4">Choose a mode</h2>
          <ul className="wordquest-mode-list">
            {MODES.map((mode) => (
              <li key={mode.id} className="wordquest-mode-row">
                <button type="button" className="wordquest-mode-card" onClick={() => onSelect(mode.id)}>
                  <span className="wordquest-mode-title">{mode.title}</span>
                  <span className="wordquest-mode-desc">{mode.description}</span>
                </button>
                <button
                  type="button"
                  className="wordquest-results-btn"
                  onClick={() => onResults(mode.id)}
                  aria-label={`${mode.title} results`}
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                    <rect x="3" y="12" width="4" height="9" rx="1" fill="currentColor" />
                    <rect x="10" y="4" width="4" height="17" rx="1" fill="currentColor" />
                    <rect x="17" y="9" width="4" height="12" rx="1" fill="currentColor" />
                  </svg>
                  <span>Results</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div role="tabpanel">
          <WordQuestBadges badges={badges} owned={ownedBadges} />
        </div>
      )}
    </div>
  );
};