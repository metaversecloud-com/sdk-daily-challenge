import { MouseEvent, PointerEvent, useEffect, useRef, useState } from "react";

interface WordHuntGridProps {
  tiles: string[];
  size: number;
  disabled: boolean;
  onPathChange: (path: number[]) => void;
  onSubmitPath: (path: number[]) => void;
  onHint: (message: string) => void;
}

// Only the inner part of each cell counts as a hit while dragging, so diagonal moves
// don't accidentally clip the neighboring tiles.
const HIT_INSET_RATIO = 0.2;

const areTilesAdjacent = (a: number, b: number, size: number) => {
  const rowDiff = Math.abs(Math.floor(a / size) - Math.floor(b / size));
  const colDiff = Math.abs((a % size) - (b % size));
  return a !== b && rowDiff <= 1 && colDiff <= 1;
};

export const WordHuntGrid = ({ tiles, size, disabled, onPathChange, onSubmitPath, onHint }: WordHuntGridProps) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pathRef = useRef<number[]>([]);
  const isDraggingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [path, setPath] = useState<number[]>([]);
  const [isKeyboardPath, setIsKeyboardPath] = useState(false);

  const updatePath = (nextPath: number[]) => {
    pathRef.current = nextPath;
    setPath(nextPath);
    onPathChange(nextPath);
  };

  useEffect(() => {
    if (disabled) {
      isDraggingRef.current = false;
      setIsKeyboardPath(false);
      updatePath([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const getTileAtPoint = (x: number, y: number) => {
    for (let i = 0; i < tileRefs.current.length; i++) {
      const rect = tileRefs.current[i]?.getBoundingClientRect();
      if (!rect) continue;
      const insetX = rect.width * HIT_INSET_RATIO;
      const insetY = rect.height * HIT_INSET_RATIO;
      if (x >= rect.left + insetX && x <= rect.right - insetX && y >= rect.top + insetY && y <= rect.bottom - insetY) {
        return i;
      }
    }
    return null;
  };

  // Extends (or backtracks) the drag path when the pointer enters a tile.
  const visitTile = (index: number) => {
    const current = pathRef.current;
    const last = current[current.length - 1];
    if (index === last) return;
    if (current.length > 1 && index === current[current.length - 2]) {
      updatePath(current.slice(0, -1));
    } else if (!current.includes(index) && areTilesAdjacent(last, index, size)) {
      updatePath([...current, index]);
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    const index = getTileAtPoint(event.clientX, event.clientY);
    if (index === null) return;

    event.preventDefault();
    try {
      // Keep receiving moves even if the finger/mouse leaves the grid mid-drag.
      gridRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Capture is best-effort; dragging still works while the pointer stays over the grid.
    }
    isDraggingRef.current = true;
    lastPointRef.current = { x: event.clientX, y: event.clientY };
    setIsKeyboardPath(false);
    updatePath([index]);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !lastPointRef.current) return;

    // Sample points between pointer events so fast swipes don't skip over tiles.
    const from = lastPointRef.current;
    const to = { x: event.clientX, y: event.clientY };
    const tileSize = tileRefs.current[0]?.getBoundingClientRect().width || 40;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (tileSize / 4)));
    for (let step = 1; step <= steps; step++) {
      const index = getTileAtPoint(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps);
      if (index !== null) visitTile(index);
    }
    lastPointRef.current = to;
  };

  const endDrag = (shouldSubmit: boolean) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    lastPointRef.current = null;
    const finalPath = pathRef.current;
    updatePath([]);
    if (shouldSubmit && finalPath.length > 1) onSubmitPath(finalPath);
  };

  // Keyboard / assistive-tech selection: activate letters one at a time, then submit.
  const handleTileClick = (event: MouseEvent<HTMLButtonElement>, index: number) => {
    // Mouse/touch input is handled by the drag handlers above. Keyboard and screen-reader activation
    // produce clicks with no pointer type (or detail 0 in browsers without PointerEvent clicks).
    const { pointerType } = event.nativeEvent as globalThis.PointerEvent;
    const isPointerClick = pointerType !== undefined ? pointerType !== "" : event.detail > 0;
    if (isPointerClick || disabled) return;
    const current = pathRef.current;
    const last = current[current.length - 1];

    setIsKeyboardPath(true);
    if (current.length === 0) {
      updatePath([index]);
    } else if (index === last) {
      updatePath(current.slice(0, -1));
    } else if (current.includes(index)) {
      onHint("That letter is already in your word.");
    } else if (areTilesAdjacent(last, index, size)) {
      updatePath([...current, index]);
    } else {
      onHint("Pick a letter next to the last one.");
    }
  };

  const handleKeyboardSubmit = () => {
    const finalPath = pathRef.current;
    setIsKeyboardPath(false);
    updatePath([]);
    onSubmitPath(finalPath);
  };

  const handleKeyboardClear = () => {
    setIsKeyboardPath(false);
    updatePath([]);
  };

  const linePoints = path.map((index) => `${(index % size) + 0.5},${Math.floor(index / size) + 0.5}`).join(" ");

  return (
    <div className="wh-panel wh-panel--grid">
      <p id="wh-grid-instructions" className="sr-only">
        Drag across letters that touch, including diagonally, to make words of 3 or more letters. With a keyboard, press
        Enter on each letter in order, then choose Submit word.
      </p>
      <div
        ref={gridRef}
        className="wh-grid"
        style={{ "--wh-grid-size": size } as React.CSSProperties}
        role="group"
        aria-label="Letter grid"
        aria-describedby="wh-grid-instructions"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => endDrag(true)}
        onPointerCancel={() => endDrag(false)}
        onLostPointerCapture={() => endDrag(true)}
      >
        {tiles.map((tile, index) => {
          const isSelected = path.includes(index);
          return (
            <button
              key={index}
              ref={(element) => (tileRefs.current[index] = element)}
              type="button"
              className={`wh-tile ${isSelected ? "wh-tile--selected" : ""}`}
              aria-label={`${tile}, row ${Math.floor(index / size) + 1}, column ${(index % size) + 1}`}
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={(event) => handleTileClick(event, index)}
            >
              <span className="wh-tile-face" aria-hidden="true">
                {tile}
              </span>
            </button>
          );
        })}
        {path.length > 1 && (
          <svg className="wh-line" viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
            <polyline points={linePoints} />
          </svg>
        )}
      </div>

      {isKeyboardPath && path.length > 0 && (
        <div className="wh-keyboard-actions">
          <button type="button" className="btn wh-btn" onClick={handleKeyboardSubmit}>
            Submit word
          </button>
          <button type="button" className="btn wh-btn wh-btn--outline" onClick={handleKeyboardClear}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
};

export default WordHuntGrid;
