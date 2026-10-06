/**
 * SwipeToDelete — CHANGE #4: hand-rolled pointer swipe with LEFT-anchored delete.
 *
 * FALLBACK PATH: react-swipeable-list requires prop-types (missing from
 * node_modules) and therefore fails at runtime. This hand-rolled implementation
 * keeps the SAME component boundary + props so it is a drop-in swap for the
 * library version.
 *
 * Behaviour:
 * - Red Delete button is on the LEFT, revealed by a RIGHTWARD (left-to-right) swipe.
 * - Swipe threshold: 80 px rightward.
 * - On trigger → confirm dialog ("Delete '<title>'?" Yes/No) → on confirm, remove().
 * - Plain tap on the row body navigates to edit (handled by TodoRow).
 * - Interaction model: pointer events track leftward/rightward swipe; the row's
 *   touch-action is pan-y so vertical scroll still works while horizontal
 *   swipe is handled by the pointer handlers.
 *
 * Tests: assert the leading (left) delete action config, drive delete via the
 * revealed button's click handler (per android-webview-jev-testing skill caveat).
 */
import { useState, useRef, useCallback, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface SwipeToDeleteProps {
  /** The id of the todo being rendered. */
  todoId: number;
  /** The title shown in the confirm dialog. */
  todoTitle: string;
  /** Called AFTER confirm; parent calls useTodos.remove(). */
  onDelete: () => void;
  /** Row content (a SortableTodoRow or TodoRow). */
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SWIPE_THRESHOLD = 80;      // px rightward to reveal delete
const DELETE_BUTTON_WIDTH = 80;  // px of the delete reveal panel

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const containerStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  touchAction: "pan-y",
};

const deleteButtonStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  bottom: 0,
  width: `${DELETE_BUTTON_WIDTH}px`,
  backgroundColor: "#e53935",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "14px",
  fontWeight: "bold",
  cursor: "pointer",
  userSelect: "none",
  zIndex: 1,
};

const rowWrapperStyle = (offset: number): CSSProperties => ({
  position: "relative",
  transform: `translateX(${offset}px)`,
  transition: offset === 0 ? "transform 0.2s ease" : "none",
  zIndex: 2,
  backgroundColor: "#fff",
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SwipeToDelete({
  todoId,
  todoTitle,
  onDelete,
  children,
}: SwipeToDeleteProps): JSX.Element {
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const startXRef = useRef<number | null>(null);
  const startOffsetRef = useRef<number>(0);
  const isDraggingRef = useRef(false);

  // -------------------------------------------------------------------------
  // Pointer handlers — track rightward swipe to reveal LEFT delete button
  // -------------------------------------------------------------------------
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      startXRef.current = e.clientX;
      startOffsetRef.current = offset;
      isDraggingRef.current = false;
    },
    [offset]
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      if (startXRef.current === null) return;
      const delta = e.clientX - startXRef.current;

      // Only track rightward swipe (positive delta)
      if (delta < 0) {
        // Swiping left: collapse if revealed
        if (revealed) {
          const newOffset = Math.max(0, startOffsetRef.current + delta);
          setOffset(newOffset);
        }
        return;
      }

      isDraggingRef.current = true;
      const newOffset = Math.min(DELETE_BUTTON_WIDTH, startOffsetRef.current + delta);
      setOffset(newOffset);
    },
    [revealed]
  );

  const handlePointerUp = useCallback(
    (_e: ReactPointerEvent<HTMLDivElement>): void => {
      startXRef.current = null;

      if (offset >= SWIPE_THRESHOLD) {
        // Snap to fully revealed
        setOffset(DELETE_BUTTON_WIDTH);
        setRevealed(true);
      } else {
        // Snap back
        setOffset(0);
        setRevealed(false);
      }
      isDraggingRef.current = false;
    },
    [offset]
  );

  const handlePointerCancel = useCallback((): void => {
    startXRef.current = null;
    setOffset(0);
    setRevealed(false);
    isDraggingRef.current = false;
  }, []);

  // -------------------------------------------------------------------------
  // Delete action
  // -------------------------------------------------------------------------
  const handleDeleteClick = useCallback((): void => {
    // Show confirm dialog
    const confirmed = window.confirm(`Delete '${todoTitle}'?`);
    if (confirmed) {
      onDelete();
    } else {
      // Collapse
      setOffset(0);
      setRevealed(false);
    }
  }, [todoTitle, onDelete]);

  return (
    <div
      style={containerStyle}
      data-testid={`swipe-container-${todoId}`}
    >
      {/* LEFT-anchored delete button — CHANGE #4 (leadingActions equivalent) */}
      <div
        data-testid={`delete-${todoId}`}
        data-swipe-side="leading"
        style={deleteButtonStyle}
        onClick={handleDeleteClick}
        role="button"
        aria-label={`Delete ${todoTitle}`}
      >
        Delete
      </div>

      {/* Row content shifted rightward on swipe */}
      <div
        style={rowWrapperStyle(offset)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {children}
      </div>
    </div>
  );
}
