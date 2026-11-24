import { useContext, useEffect, useState } from "react";

// context
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// types
import {
  WordHuntBadge,
  WordHuntBadgeCategory,
  WordHuntBadgesResponse,
  WordHuntMode,
} from "@shared/types/wordhunt/WordHuntTypes";

// utils
import { backendAPI, setErrorMessage } from "@/utils";

/** Badges are grouped by the game mode that earns them, then by category. */
const MODE_SECTIONS: {
  mode: WordHuntMode;
  title: string;
  note: string;
  categories: { id: WordHuntBadgeCategory; label: string }[];
}[] = [
  {
    mode: "classic",
    title: "Classic badges",
    note: "Earned by playing Classic games.",
    categories: [
      { id: "play", label: "Play" },
      { id: "score", label: "Score" },
      { id: "special", label: "Special" },
    ],
  },
  {
    mode: "golden",
    title: "Golden Letter badges",
    note: "Earned by playing Golden Letter games.",
    categories: [{ id: "golden", label: "Golden Letter" }],
  },
];

const MODE_NAMES: Record<WordHuntMode, string> = { classic: "Classic", golden: "Golden Letter" };

interface WordHuntBadgesProps {
  /** Changing this value reloads the badges (e.g. after a game ends). */
  refreshKey?: string;
}

export const WordHuntBadges = ({ refreshKey }: WordHuntBadgesProps) => {
  const dispatch = useContext(GlobalDispatchContext);
  const { hasInteractiveParams } = useContext(GlobalStateContext);

  const [badges, setBadges] = useState<WordHuntBadge[] | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!hasInteractiveParams) return;
    let isCurrent = true;
    // Topia adds ?forceRefreshInventory=true to the iframe URL after uploading new badge items.
    const forceRefreshInventory = new URLSearchParams(window.location.search).get("forceRefreshInventory") === "true";
    backendAPI
      .get("/wordhunt/badges", { params: { forceRefreshInventory } })
      .then((response) => {
        if (isCurrent) setBadges((response.data.data as WordHuntBadgesResponse).badges);
      })
      .catch((error) => setErrorMessage(dispatch, error as ErrorType));
    return () => {
      isCurrent = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInteractiveParams, refreshKey]);

  if (!badges) return <p className="p2 text-center" role="status">Loading badges…</p>;

  const earnedCount = badges.filter((badge) => badge.earned).length;
  const selected = badges.find((badge) => badge.slug === selectedSlug) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="wh-panel text-center">
        <h1 className="h4">Badges</h1>
        <p className="p2" aria-live="polite">
          {earnedCount} of {badges.length} earned
        </p>
      </div>

      <div className="wh-panel wh-badge-detail" aria-live="polite">
        {selected ? (
          <>
            <h2 className="h4">{selected.name}</h2>
            <p className="p2">{selected.description}</p>
            <p className="p3">
              <span className={`wh-badge-mode wh-badge-mode--${selected.mode}`}>
                {selected.mode === "golden" && <span aria-hidden="true">★ </span>}
                Earned in {MODE_NAMES[selected.mode]} games
              </span>
            </p>
            <p className="p3 wh-badge-status">
              {selected.earned
                ? "Earned"
                : selected.progress
                  ? `Locked: ${selected.progress.current.toLocaleString()} / ${selected.progress.target.toLocaleString()}`
                  : "Locked"}
            </p>
          </>
        ) : (
          <p className="p2">Tap a badge to see how to earn it.</p>
        )}
      </div>

      {MODE_SECTIONS.map(({ mode, title, note, categories }) => {
        const modeBadges = badges.filter((badge) => badge.mode === mode);
        // A section with a single category doesn't need a separate category heading.
        const showCategoryHeadings = categories.length > 1;
        return (
          <section
            key={mode}
            className={`wh-panel wh-badge-section wh-badge-section--${mode}`}
            aria-labelledby={`wh-badges-mode-${mode}`}
          >
            <div className="wh-badge-section-header">
              <h2 id={`wh-badges-mode-${mode}`} className="h4">
                {mode === "golden" && <span aria-hidden="true">★ </span>}
                {title}
              </h2>
              <p className="p3">
                {note} {modeBadges.filter((badge) => badge.earned).length} of {modeBadges.length} earned.
              </p>
            </div>
            {categories.map(({ id, label }) => (
              <div key={id} {...(showCategoryHeadings && { role: "group", "aria-labelledby": `wh-badges-${id}` })}>
                {showCategoryHeadings && (
                  <h3 id={`wh-badges-${id}`} className="p2 wh-badge-heading">
                    {label}
                  </h3>
                )}
                <ul className="wh-badge-grid">
                  {modeBadges
                    .filter((badge) => badge.category === id)
                    .map((badge) => (
                      <li key={badge.slug}>
                        <button
                          type="button"
                          className={`wh-badge ${badge.earned ? "" : "wh-badge--locked"} ${
                            badge.slug === selectedSlug ? "wh-badge--selected" : ""
                          }`}
                          aria-pressed={badge.slug === selectedSlug}
                          onClick={() => setSelectedSlug(badge.slug)}
                        >
                          <img src={badge.image} alt="" width={88} height={88} />
                          <span className="wh-badge-name">{badge.name}</span>
                          <span className="sr-only">
                            {badge.earned ? "Earned" : "Locked"}, {MODE_NAMES[badge.mode]} badge
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
};

export default WordHuntBadges;
