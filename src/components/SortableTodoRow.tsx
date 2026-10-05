/**
 * SortableTodoRow — wraps TodoRow with @dnd-kit/sortable useSortable.
 *
 * BUGFIX #3 implementation:
 * - Uses useSortable to provide drag state + listeners.
 * - Only the ☰ drag handle has drag listeners (via dragHandleProps).
 * - Activation uses PointerSensor + TouchSensor with delay+tolerance so
 *   a plain tap opens the editor while a long-press activates drag.
 * - The parent DndContext handles autoScroll (enabled by default).
 * - onDragEnd in the parent calls useTodos.reorder() to persist.
 */
import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TodoRow } from "./TodoRow.js";
import type { TodoRowProps } from "./TodoRow.js";
import type { Todo } from "../models/Todo.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface SortableTodoRowProps
  extends Omit<TodoRowProps, "dragHandleProps"> {
  todo: Todo;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SortableTodoRow({
  todo,
  onToggleComplete,
  onEdit,
  children,
}: SortableTodoRowProps): JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 999 : "auto",
    position: "relative",
  };

  // Only the ☰ handle gets drag listeners — tap on the row body opens editor
  const dragHandleProps = {
    ...attributes,
    ...listeners,
  } as Record<string, unknown>;

  return (
    <div ref={setNodeRef} style={style}>
      <TodoRow
        todo={todo}
        onToggleComplete={onToggleComplete}
        onEdit={onEdit}
        dragHandleProps={dragHandleProps}
      >
        {children}
      </TodoRow>
    </div>
  );
}
