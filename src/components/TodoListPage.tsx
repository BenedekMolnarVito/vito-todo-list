/**
 * TodoListPage — main list view.
 *
 * BUGFIX #3: hosts DndContext + SortableContext with live reorder during
 * onDragOver (arrayMove on state), autoScroll enabled (default), and
 * onDragEnd persists via useTodos.reorder().
 *
 * Renders each row as SwipeToDelete > SortableTodoRow for swipe + drag.
 *
 * Export/share/import controls are also here.
 */
import { useState, useRef, type ChangeEvent, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import type { UseTodosResult } from "../hooks/useTodos.js";
import type { Todo } from "../models/Todo.js";
import { SortableTodoRow } from "./SortableTodoRow.js";
import { SwipeToDelete } from "./SwipeToDelete.js";
import {
  YELLOW_BACKGROUND,
  YELLOW_MEDIUM,
  YELLOW_DARK,
  YELLOW_DEEP,
} from "./TodoRow.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface TodoListPageProps {
  todos: Todo[];
  loading: boolean;
  onToggleComplete: UseTodosResult["toggleComplete"];
  onRemove: UseTodosResult["remove"];
  onReorder: UseTodosResult["reorder"];
  onExportJson: UseTodosResult["exportJson"];
  onShareExport: UseTodosResult["shareExport"];
  onImportJson: UseTodosResult["importJson"];
}

// ---------------------------------------------------------------------------
// computeReorderIdSequence — pure onDragEnd decision logic (BUGFIX #3).
//
// Extracted from handleDragEnd so it can be unit-tested directly (the component
// handler just calls this), rather than a test re-implementing the guard inline.
//
//   - Returns null  → no-op: no drop target, or dropped on itself (same id).
//     A same-position drop must NOT fire onReorder (would issue N redundant
//     UPDATE "Order" writes + a full reload for zero change).
//   - Returns the id sequence of `localTodos` otherwise. localTodos is already
//     live-reordered during handleDragOver, so its current id order IS the
//     final order to persist.
//
// activeId / overId are dnd-kit UniqueIdentifiers (string | number); todo ids
// are numbers, so the returned sequence is number[].
// ---------------------------------------------------------------------------
export function computeReorderIdSequence(
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier | null,
  localTodos: Todo[]
): number[] | null {
  if (overId === null || activeId === overId) return null;
  return localTodos.map((t) => t.id);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const pageStyle: CSSProperties = {
  minHeight: "100vh",
  backgroundColor: YELLOW_BACKGROUND,
  fontFamily: "sans-serif",
};

const headerStyle: CSSProperties = {
  backgroundColor: YELLOW_DARK,
  color: "#fff",
  padding: "16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const titleTextStyle: CSSProperties = {
  fontSize: "20px",
  fontWeight: "bold",
  margin: 0,
};

const addButtonStyle: CSSProperties = {
  backgroundColor: "#fff",
  color: YELLOW_DEEP,
  border: "none",
  borderRadius: "50%",
  width: "40px",
  height: "40px",
  fontSize: "24px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "bold",
};

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  padding: "8px 16px",
  backgroundColor: YELLOW_MEDIUM,
};

const toolbarButtonStyle: CSSProperties = {
  backgroundColor: YELLOW_DARK,
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: "13px",
};

const loadingStyle: CSSProperties = {
  padding: "24px",
  textAlign: "center",
  color: YELLOW_DEEP,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TodoListPage({
  todos,
  loading,
  onToggleComplete,
  onRemove,
  onReorder,
  onExportJson,
  onShareExport,
  onImportJson,
}: TodoListPageProps): JSX.Element {
  const navigate = useNavigate();
  // Local state for live-reorder during drag (BUGFIX #3)
  const [localTodos, setLocalTodos] = useState<Todo[]>(todos);
  // Sync localTodos when parent todos change (after load/persist)
  const prevTodosRef = useRef<Todo[]>(todos);
  if (prevTodosRef.current !== todos) {
    prevTodosRef.current = todos;
    setLocalTodos(todos);
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // DnD sensors — BUGFIX #3: long-press to activate drag, tap opens editor
  // -------------------------------------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );

  // -------------------------------------------------------------------------
  // DnD handlers
  // -------------------------------------------------------------------------
  function handleDragOver(event: DragOverEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Live reorder during drag (BUGFIX #3 — state changes during onDragOver)
    setLocalTodos((prev) => {
      const oldIndex = prev.findIndex((t) => t.id === active.id);
      const newIndex = prev.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    // Delegate the pure decision to computeReorderIdSequence (exported +
    // unit-tested): it returns null for a no-op (no over / same-position drop)
    // and the final id order otherwise. Without the no-op guard, dropping a row
    // where it started still fires onReorder → N redundant UPDATE "Order"
    // statements + a full reload for zero change. handleDragOver already guards
    // the same case for the live-reorder path.
    const newIdOrder = computeReorderIdSequence(
      active.id,
      over?.id ?? null,
      localTodos
    );
    if (newIdOrder === null) return;

    // Persist via useTodos.reorder
    void onReorder(newIdOrder);
  }

  // -------------------------------------------------------------------------
  // Import
  // -------------------------------------------------------------------------
  function handleImportClick(): void {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const ok = await onImportJson(text);
    if (!ok) {
      alert("Import failed: invalid JSON format.");
    }
    // Reset input so same file can be re-imported
    e.target.value = "";
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div style={pageStyle} data-testid="todo-list-page">
      {/* Header */}
      <div style={headerStyle}>
        <h1 style={titleTextStyle}>VitoTodoList</h1>
        <button
          data-testid="add-button"
          style={addButtonStyle}
          onClick={() => { void navigate("/add"); }}
          aria-label="Add todo"
        >
          +
        </button>
      </div>

      {/* Toolbar */}
      <div style={toolbarStyle}>
        <button
          style={toolbarButtonStyle}
          onClick={() => { void onShareExport(); }}
          aria-label="Export and share todos"
        >
          Share
        </button>
        <button
          style={toolbarButtonStyle}
          onClick={() => {
            const json = onExportJson();
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `todos_export_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          aria-label="Export todos as JSON"
        >
          Export
        </button>
        <button
          style={toolbarButtonStyle}
          onClick={handleImportClick}
          aria-label="Import todos from JSON"
        >
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={(e) => { void handleFileChange(e); }}
          aria-hidden="true"
        />
      </div>

      {/* List */}
      {loading ? (
        <div style={loadingStyle}>Loading…</div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          autoScroll={true}
        >
          <SortableContext
            items={localTodos.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul style={listStyle} role="list" data-testid="todo-list">
              {localTodos.map((todo) => (
                <li key={todo.id}>
                  <SwipeToDelete
                    todoId={todo.id}
                    todoTitle={todo.title}
                    onDelete={() => { void onRemove(todo.id); }}
                  >
                    <SortableTodoRow
                      todo={todo}
                      onToggleComplete={(id) => { void onToggleComplete(id); }}
                      onEdit={(id) => { void navigate(`/edit/${id}`); }}
                    />
                  </SwipeToDelete>
                </li>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
