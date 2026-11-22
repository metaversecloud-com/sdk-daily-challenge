import { WordHuntWordOfTheDay } from "@shared/types/wordhunt/WordHuntTypes";

interface WordHuntWordOfTheDayPanelProps {
  wordOfTheDay: WordHuntWordOfTheDay;
  wasFound: boolean;
}

export const WordHuntWordOfTheDayPanel = ({ wordOfTheDay, wasFound }: WordHuntWordOfTheDayPanelProps) => {
  const { word, points, definition } = wordOfTheDay;

  return (
    <section className="wh-panel wh-wotd" aria-labelledby="wh-wotd-heading">
      <h2 id="wh-wotd-heading" className="h4">
        Word of the Day
      </h2>
      <p className="p3">The longest word on today's board</p>

      <p className="wh-wotd-word">
        {word.toUpperCase()}
        <span className="wh-wotd-points">{points.toLocaleString()} pts</span>
      </p>

      <p className={`p3 wh-wotd-status ${wasFound ? "wh-wotd-status--found" : ""}`}>
        <span aria-hidden="true">{wasFound ? "✓ " : ""}</span>
        {wasFound ? "You found it!" : "You didn't find it this time."}
      </p>

      {definition ? (
        <p className="p2 wh-wotd-definition">
          <span className="wh-wotd-pos">{definition.partOfSpeech}</span>
          {definition.baseWord && <> (form of “{definition.baseWord}”)</>}: {definition.text}
        </p>
      ) : (
        <p className="p2 wh-wotd-definition">No definition available.</p>
      )}
    </section>
  );
};

export default WordHuntWordOfTheDayPanel;
