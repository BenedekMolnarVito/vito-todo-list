/**
 * TodoRow — presentational row component.
 *
 * - Checkbox: toggleComplete on click.
 * - Title: strikethrough when isCompleted.
 * - Deadline label: "Due: MMM dd, HH:mm" when deadline is set.
 * - ☰ drag handle: drag-only target (supplied via dragHandleProps).
 * - Row body tap (not handle/checkbox) → navigate to /edit/:id.
 *
 * No @capacitor/* imports — purely presentational.
 */
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import type { Todo } from "../models/Todo.js";

// ---------------------------------------------------------------------------
// Yellow theme colors (from MAUI theme, plan §5.5)
// ---------------------------------------------------------------------------
export const YELLOW_BACKGROUND = "#FFEB3B";
export const YELLOW_LIGHT = "#FFF9C4";
export const YELLOW_MEDIUM = "#FDD835";
export const YELLOW_DARK = "#F9A825";
export const YELLOW_DEEP = "#F57F17";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDeadline(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `Due: ${month} ${day}, ${hours}:${mins}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface TodoRowProps {
  todo: Todo;
  onToggleComplete: (id: number) => void;
  onEdit: (id: number) => void;
  /** Props to spread onto the ☰ drag handle element (from useSortable). */
  dragHandleProps?: Record<string, unknown>;
  /** Extra content rendered inside the row (e.g. the drag listener overlay). */
  children?: ReactNode;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  backgroundColor: YELLOW_LIGHT,
  borderBottom: `1px solid ${YELLOW_MEDIUM}`,
  padding: "10px 8px",
  gap: "8px",
  cursor: "pointer",
  userSelect: "none",
  minHeight: "52px",
};

const checkboxStyle: CSSProperties = {
  width: "20px",
  height: "20px",
  cursor: "pointer",
  flexShrink: 0,
  accentColor: YELLOW_DARK,
};

const titleStyle = (completed: boolean): CSSProperties => ({
  flex: 1,
  fontSize: "16px",
  textDecoration: completed ? "line-through" : "none",
  color: completed ? "#888" : "#222",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const deadlineStyle: CSSProperties = {
  fontSize: "12px",
  color: YELLOW_DEEP,
  whiteSpace: "nowrap",
};

const dragHandleStyle: CSSProperties = {
  fontSize: "18px",
  cursor: "grab",
  padding: "4px 6px",
  color: YELLOW_DARK,
  touchAction: "none",
  flexShrink: 0,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TodoRow({
  todo,
  onToggleComplete,
  onEdit,
  dragHandleProps = {},
  children,
}: TodoRowProps): JSX.Element {
  function handleRowClick(e: MouseEvent<HTMLDivElement>): void {
    // Navigate to edit — handled by parent
    onEdit(todo.id);
  }

  function handleCheckboxClick(e: MouseEvent<HTMLInputElement>): void {
    // Stop propagation so clicking checkbox doesn't also trigger row click/edit
    e.stopPropagation();
    onToggleComplete(todo.id);
  }

  function handleHandleClick(e: MouseEvent<HTMLSpanElement>): void {
    // Stop propagation so tapping the handle doesn't navigate to edit
    e.stopPropagation();
  }

  return (
    <div
      data-testid={`todo-row-${todo.id}`}
      style={rowStyle}
      onClick={handleRowClick}
      role="listitem"
    >
      {/* ☰ drag handle first: left-handed layout */}
      <span
        data-testid={`drag-handle-${todo.id}`}
        style={dragHandleStyle}
        onClick={handleHandleClick}
        aria-label="Drag to reorder"
        role="button"
        {...(dragHandleProps as Record<string, unknown>)}
      >
        ☰
      </span>

      <input
        type="checkbox"
        data-testid={`checkbox-${todo.id}`}
        checked={todo.isCompleted}
        onChange={() => {
          /* handled via onClick below */
        }}
        onClick={handleCheckboxClick}
        style={checkboxStyle}
        aria-label={`Complete ${todo.title}`}
      />

      <span data-testid={`todo-title-${todo.id}`} style={titleStyle(todo.isCompleted)}>
        {todo.title}
      </span>

      {todo.deadline !== null && (
        <span style={deadlineStyle}>{formatDeadline(todo.deadline)}</span>
      )}

      {children}
    </div>
  );
}
