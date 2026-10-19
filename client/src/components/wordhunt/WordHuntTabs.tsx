import { KeyboardEvent, useRef } from "react";

export type WordHuntTab = "play" | "badges";

const TABS: { id: WordHuntTab; label: string }[] = [
  { id: "play", label: "Play" },
  { id: "badges", label: "Badges" },
];

interface WordHuntTabsProps {
  active: WordHuntTab;
  onChange: (tab: WordHuntTab) => void;
  /** Label for the first tab, since after a game it shows the results. */
  playLabel?: string;
}

export const WordHuntTabs = ({ active, onChange, playLabel }: WordHuntTabsProps) => {
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  // Arrow keys move between tabs, as in the standard tabs pattern.
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!offset) return;
    event.preventDefault();
    const next = TABS[(index + offset + TABS.length) % TABS.length].id;
    onChange(next);
    buttons.current[next]?.focus();
  };

  return (
    <div className="wh-tabs" role="tablist" aria-label="Word Hunt sections">
      {TABS.map(({ id, label }, index) => (
        <button
          key={id}
          ref={(el) => (buttons.current[id] = el)}
          type="button"
          role="tab"
          id={`wh-tab-${id}`}
          aria-selected={active === id}
          aria-controls="wh-tabpanel"
          tabIndex={active === id ? 0 : -1}
          className={`wh-tab ${active === id ? "wh-tab--active" : ""}`}
          onClick={() => onChange(id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {id === "play" && playLabel ? playLabel : label}
        </button>
      ))}
    </div>
  );
};

export default WordHuntTabs;
