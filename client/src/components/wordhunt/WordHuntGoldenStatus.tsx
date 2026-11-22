import { WordHuntGame } from "@shared/types/wordhunt/WordHuntTypes";
import { getGoldenMultiplier, getMedal } from "@shared/wordhunt/golden";

const MEDALS = ["bronze", "silver", "gold"] as const;
const MEDAL_LABELS = { bronze: "Bronze", silver: "Silver", gold: "Gold" } as const;

interface WordHuntGoldenStatusProps {
  game: WordHuntGame;
}

/** Golden mode, during a game: the golden letter, the streak bonus for the next golden word, and the next goal. */
export const WordHuntGoldenStatus = ({ game }: WordHuntGoldenStatusProps) => {
  const { goldenLetter, goals } = game.board;
  const streak = game.goldenStreak ?? 0;
  const medal = getMedal(game.score, goals);
  const nextMedal = goals ? MEDALS.find((name) => game.score < goals[name]) : undefined;

  return (
    <div className="wh-panel wh-golden-status">
      {goldenLetter && (
        <p className="wh-golden-chip">
          <span aria-hidden="true">★</span> Golden letter <strong>{goldenLetter.toUpperCase()}</strong>
        </p>
      )}
      <p className="wh-golden-streak">
        {streak > 0 ? `${streak} golden in a row · ` : ""}next golden word <strong>×{getGoldenMultiplier(streak + 1)}</strong>
      </p>
      {goals && (
        <p className="wh-golden-goal">
          {nextMedal ? (
            <>
              {medal && `${MEDAL_LABELS[medal]} reached · `}Next: {MEDAL_LABELS[nextMedal]} at{" "}
              <strong>{goals[nextMedal].toLocaleString()}</strong>
            </>
          ) : (
            <strong>Gold goal reached!</strong>
          )}
        </p>
      )}
    </div>
  );
};

export default WordHuntGoldenStatus;
