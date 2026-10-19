import { useCallback, useContext, useEffect, useRef, useState } from "react";

// components
import { Loading } from "@/components";
import {
  WordHuntBadges,
  WordHuntExitModal,
  WordHuntGrid,
  WordHuntResults,
  WordHuntStart,
  WordHuntTab,
  WordHuntTabs,
} from "@/components/wordhunt";

// context
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// types
import {
  WordHuntBoard,
  WordHuntGame,
  WordHuntGameStateResponse,
  WordHuntSubmitResult,
  WordHuntSubmitWordResponse,
} from "@shared/types/wordhunt/WordHuntTypes";

// utils
import { backendAPI, setErrorMessage } from "@/utils";

type Phase = "loading" | "start" | "playing" | "ending" | "results";
type Feedback = { type: "success" | "error"; text: string; id: number } | null;

const MIN_WORD_LENGTH = 3;
const TIME_ANNOUNCEMENTS_SECONDS = [60, 30, 10];

const FEEDBACK_MESSAGES: Record<Exclude<WordHuntSubmitResult, "valid">, string> = {
  not_a_word: "Sorry, that is not a valid word.",
  too_short: "Words need at least 3 letters.",
  already_found: "You already found that word.",
  invalid_path: "Letters must touch each other.",
  game_over: "Time's up!",
};

const formatTime = (ms: number) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
};

export const WordHunt = () => {
  const dispatch = useContext(GlobalDispatchContext);
  const { error, hasInteractiveParams } = useContext(GlobalStateContext);

  const [phase, setPhase] = useState<Phase>("loading");
  const [board, setBoard] = useState<WordHuntBoard | null>(null);
  const [game, setGame] = useState<WordHuntGame | null>(null);
  const [currentWord, setCurrentWord] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [timeAnnouncement, setTimeAnnouncement] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [tab, setTab] = useState<WordHuntTab>("play");
  const [newBadges, setNewBadges] = useState<string[]>([]);

  // Difference between the server clock and this device's clock, so the timer matches the server.
  const clockOffsetRef = useRef(0);
  // Word submissions are sent one at a time so each response reflects every earlier word.
  const submitQueueRef = useRef<Promise<void>>(Promise.resolve());
  const gameRef = useRef<WordHuntGame | null>(null);
  const isEndingRef = useRef(false);
  const announcedRef = useRef(new Set<number>());

  const applyGameState = (data: WordHuntGameStateResponse | WordHuntSubmitWordResponse) => {
    clockOffsetRef.current = data.serverTime - Date.now();
    gameRef.current = data.game;
    setGame(data.game);
    if ("board" in data) setBoard(data.board);
  };

  const showFeedback = (type: "success" | "error", text: string) => setFeedback({ type, text, id: Date.now() });

  useEffect(() => {
    if (!hasInteractiveParams) return;
    backendAPI
      .get("/wordhunt/game-state")
      .then((response) => {
        const data = response.data.data as WordHuntGameStateResponse;
        applyGameState(data);
        const isInProgress = data.game && !data.game.endedAt && data.game.endsAt > data.serverTime;
        setPhase(isInProgress ? "playing" : "start");
      })
      .catch((error) => {
        setErrorMessage(dispatch, error as ErrorType);
        setPhase("start");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInteractiveParams]);

  const startGame = async () => {
    setIsStarting(true);
    try {
      const response = await backendAPI.post("/wordhunt/start");
      applyGameState(response.data.data);
      isEndingRef.current = false;
      announcedRef.current = new Set();
      setTab("play");
      setNewBadges([]);
      setFeedback(null);
      setCurrentWord("");
      setTimeAnnouncement("");
      setPhase("playing");
    } catch (error) {
      setErrorMessage(dispatch, error as ErrorType);
    } finally {
      setIsStarting(false);
    }
  };

  const endGame = useCallback(async () => {
    if (isEndingRef.current || !gameRef.current) return;
    isEndingRef.current = true;
    setShowExitModal(false);
    setPhase("ending");

    // Let any words still being checked finish before the game is closed out.
    await submitQueueRef.current;
    try {
      const response = await backendAPI.post("/wordhunt/end", { gameId: gameRef.current.gameId });
      applyGameState(response.data.data);
      setNewBadges((response.data.data as WordHuntGameStateResponse).newBadges ?? []);
    } catch (error) {
      setErrorMessage(dispatch, error as ErrorType);
    }
    setTab("play");
    setPhase("results");
  }, [dispatch]);

  // Countdown timer
  useEffect(() => {
    if (phase !== "playing" || !game) return;

    const tick = () => {
      const remaining = game.endsAt - (Date.now() + clockOffsetRef.current);
      setRemainingMs(remaining);

      const seconds = Math.ceil(remaining / 1000);
      const announcement = TIME_ANNOUNCEMENTS_SECONDS.find(
        (threshold) => seconds <= threshold && !announcedRef.current.has(threshold),
      );
      if (announcement && seconds > 0) {
        TIME_ANNOUNCEMENTS_SECONDS.filter((t) => t >= announcement).forEach((t) => announcedRef.current.add(t));
        setTimeAnnouncement(`${announcement} seconds left`);
      }

      if (remaining <= 0) endGame();
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [phase, game?.gameId, game?.endsAt, endGame]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePathChange = useCallback(
    (path: number[]) => {
      if (!board) return;
      setCurrentWord(path.map((index) => board.tiles[index]).join(""));
    },
    [board],
  );

  const handleSubmitPath = (path: number[]) => {
    if (!board || !gameRef.current) return;
    const word = path.map((index) => board.tiles[index]).join("");
    if (word.length < MIN_WORD_LENGTH) {
      showFeedback("error", FEEDBACK_MESSAGES.too_short);
      return;
    }

    const gameId = gameRef.current.gameId;
    submitQueueRef.current = submitQueueRef.current.then(async () => {
      if (isEndingRef.current && gameRef.current?.endedAt) return;
      try {
        const response = await backendAPI.post("/wordhunt/submit-word", { gameId, path });
        const data = response.data.data as WordHuntSubmitWordResponse;
        if (gameRef.current?.gameId !== gameId) return;

        applyGameState(data);
        if (data.result === "valid") {
          showFeedback("success", `${data.word.toUpperCase()} +${data.points.toLocaleString()} points!`);
        } else {
          showFeedback("error", FEEDBACK_MESSAGES[data.result]);
          if (data.result === "game_over") endGame();
        }
      } catch (error) {
        setErrorMessage(dispatch, error as ErrorType);
      }
    });
  };

  if (phase === "loading") return <Loading />;

  const errorMessage = error && <p className="p3 mt-4 text-center wh-feedback--error">{error}</p>;

  if (phase === "start" || !board) {
    return (
      <main className="wh-app">
        <WordHuntTabs active={tab} onChange={setTab} />
        <div id="wh-tabpanel" role="tabpanel" aria-labelledby={`wh-tab-${tab}`}>
          {tab === "play" ? <WordHuntStart isStarting={isStarting} onStart={startGame} /> : <WordHuntBadges />}
        </div>
        {errorMessage}
      </main>
    );
  }

  if (phase === "results" && game) {
    return (
      <main className="wh-app">
        <WordHuntTabs active={tab} onChange={setTab} playLabel="Results" />
        <div id="wh-tabpanel" role="tabpanel" aria-labelledby={`wh-tab-${tab}`}>
          {tab === "play" ? (
            <>
              {newBadges.length > 0 && (
                <div className="wh-panel mb-4" role="status">
                  <h2 className="h4">
                    {newBadges.length === 1 ? "New badge earned!" : `${newBadges.length} new badges earned!`}
                  </h2>
                  <ul className="wh-new-badges p2">
                    {newBadges.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                  <button type="button" className="btn wh-btn wh-btn--outline mt-2" onClick={() => setTab("badges")}>
                    See my badges
                  </button>
                </div>
              )}
              <WordHuntResults game={game} isStarting={isStarting} onPlayAgain={startGame} />
            </>
          ) : (
            <WordHuntBadges refreshKey={game.gameId} />
          )}
        </div>
        {errorMessage}
      </main>
    );
  }

  const isLowTime = remainingMs <= 10_000;

  return (
    <main className="wh-app">
      <h1 className="sr-only">Word Hunt</h1>
      <div className="wh-header">
        <button
          type="button"
          className="btn wh-btn wh-btn--outline wh-btn--small"
          onClick={() => setShowExitModal(true)}
          disabled={phase !== "playing"}
        >
          Exit
        </button>
        <p className={`wh-timer ${isLowTime ? "wh-timer--low" : ""}`} role="timer" aria-label="Time remaining">
          {formatTime(remainingMs)}
        </p>
      </div>
      <p className="sr-only" role="status">
        {timeAnnouncement}
      </p>

      <div className="wh-panel wh-score">
        <span>Total Points:</span>
        <span className="wh-score-value">{String(game?.score ?? 0).padStart(4, "0")}</span>
      </div>

      <WordHuntGrid
        tiles={game?.board.tiles ?? board.tiles}
        size={game?.board.size ?? board.size}
        disabled={phase !== "playing"}
        onPathChange={handlePathChange}
        onSubmitPath={handleSubmitPath}
        onHint={(message) => showFeedback("error", message)}
      />

      <div className="wh-panel wh-word" aria-live="off">
        {currentWord ? (
          <p className="wh-word-text">{currentWord.toUpperCase()}</p>
        ) : (
          <p className="wh-word-hint">{phase === "ending" ? "Adding up your points…" : "Connect letters to make a word"}</p>
        )}
      </div>

      <p className={`wh-feedback ${feedback ? `wh-feedback--${feedback.type}` : ""}`} role="status">
        {feedback && (
          <span key={feedback.id} className={`inline-block ${feedback.type === "success" ? "wh-pop" : ""}`}>
            <span aria-hidden="true">{feedback.type === "success" ? "✓ " : "✗ "}</span>
            {feedback.text}
          </span>
        )}
      </p>
      {errorMessage}

      {showExitModal && <WordHuntExitModal onConfirm={endGame} onClose={() => setShowExitModal(false)} />}
    </main>
  );
};

export default WordHunt;
