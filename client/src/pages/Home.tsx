import { useContext, useEffect, useRef, useState } from "react";

// context
import { GlobalDispatchContext } from "@/context/GlobalContext";
import { SET_ERROR } from "@/context/types";

// pages
import { WordHunt } from "./wordhunt/WordHunt";
import { WordQuestHome } from "./wordquest/WordQuestHome";

type GameId = "wordhunt" | "wordquest";
type Screen = "menu" | GameId;

const GAMES: { id: GameId; name: string; description: string }[] = [
  {
    id: "wordhunt",
    name: "Word Hunt",
    description: "Connect touching letters to find as many words as you can before time runs out.",
  },
  {
    id: "wordquest",
    name: "WordQuest",
    description: "Guess the secret five-letter word in six tries. There's a new word every day.",
  },
];

export const Home = () => {
  const dispatch = useContext(GlobalDispatchContext);

  const [screen, setScreen] = useState<Screen>("menu");

  const lastGameRef = useRef<GameId | null>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const playButtonRefs = useRef<Partial<Record<GameId, HTMLButtonElement | null>>>({});

  // Move focus into the new screen so keyboard and screen reader users aren't left on a button that no longer exists.
  useEffect(() => {
    if (screen !== "menu") backButtonRef.current?.focus();
    else if (lastGameRef.current) playButtonRefs.current[lastGameRef.current]?.focus();
  }, [screen]);

  const changeScreen = (next: Screen) => {
    // Errors are shared app-wide, so clear them so one game's error doesn't show up in the other.
    dispatch?.({ type: SET_ERROR, payload: { error: "" } });
    if (next !== "menu") lastGameRef.current = next;
    setScreen(next);
  };

  if (screen === "menu") {
    return (
      <main className="wh-app gm-menu">
        <h1 className="wh-title">Daily Challenges</h1>
        <p className="p2 gm-subtitle">Pick a game to play.</p>
        <ul className="gm-list">
          {GAMES.map((game) => (
            <li key={game.id} className="wh-panel gm-card">
              <h2 className="h3">{game.name}</h2>
              <p className="p2">{game.description}</p>
              <button
                ref={(el) => (playButtonRefs.current[game.id] = el)}
                type="button"
                className="btn wh-btn"
                onClick={() => changeScreen(game.id)}
              >
                Play {game.name}
              </button>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <div className={`gm-screen gm-screen--${screen}`}>
      <nav className="gm-nav" aria-label="Games">
        <button ref={backButtonRef} type="button" className="btn wh-btn wh-btn--outline wh-btn--small" onClick={() => changeScreen("menu")}>
          <span aria-hidden="true">← </span>All games
        </button>
      </nav>
      {screen === "wordhunt" ? <WordHunt /> : <WordQuestHome />}
    </div>
  );
};

export default Home;
