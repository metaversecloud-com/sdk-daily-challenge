import { useContext, useEffect, useState } from "react";

// context
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// types
import { WordHuntBadge, WordHuntBadgeCategory, WordHuntBadgesResponse } from "@shared/types/wordhunt/WordHuntTypes";

// utils
import { backendAPI, setErrorMessage } from "@/utils";

const CATEGORIES: { id: WordHuntBadgeCategory; label: string }[] = [
  { id: "play", label: "Play" },
  { id: "score", label: "Score" },
  { id: "special", label: "Special" },
];

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

      {CATEGORIES.map(({ id, label }) => (
        <section key={id} aria-labelledby={`wh-badges-${id}`}>
          <h2 id={`wh-badges-${id}`} className="h4 wh-badge-heading">
            {label}
          </h2>
          <ul className="wh-badge-grid">
            {badges
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
                    <img src={`/badges/${badge.slug}.png`} alt="" width={88} height={88} />
                    <span className="wh-badge-name">{badge.name}</span>
                    <span className="sr-only">{badge.earned ? "Earned" : "Locked"}</span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

export default WordHuntBadges;
