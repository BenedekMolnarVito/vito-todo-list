/**
 * TodoListPage — main list view.
 *
 * BUGFIX #3: hosts DndContext + SortableContext with live reorder during
 * onDragOver (arrayMove on state), autoScroll enabled (default), and
 * onDragEnd persists via useTodos.reorder().
 *
 * Renders each row as SwipeToDelete > SortableTodoRow for swipe + drag.
 *
 * Export/import controls are rendered in the page header alongside the add
 * button (add on the left, export/import right-aligned on the right).
 */
import { useState, useRef, useEffect, type ChangeEvent, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragOverEvent,
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
  onExportAndShare: UseTodosResult["exportAndShare"];
  onImportJson: UseTodosResult["importJson"];
}

// ---------------------------------------------------------------------------
// hasOrderChanged — pure onDragEnd decision logic (reorder-persist bugfix).
//
// The list live-reorders during handleDragOver (arrayMove on state), so at
// drop time the dragged row sits UNDER the pointer: `over.id === active.id`
// is the NORMAL outcome of a successful move, not a no-op. The old guard
// (active.id === over.id → skip) therefore swallowed ~every real drop and
// the order silently reverted on the next reload (app restart, widget cold
// start, edit-back remount).
//
// Correct no-op test: compare the id sequence from drag START (snapshot in
// handleDragStart) against the sequence at drop. Identical → nothing moved,
// skip onReorder (no redundant UPDATE "Order" writes + reload).
// ---------------------------------------------------------------------------
export function hasOrderChanged(beforeIds: number[], afterIds: number[]): boolean {
  if (beforeIds.length !== afterIds.length) return true;
  return beforeIds.some((id, i) => id !== afterIds[i]);
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
  justifyContent: "space-between", // add button left, export/import right
};

// Right-aligned cluster of export/import buttons (replaces the former top toolbar).
const headerRightStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  padding: "8px 16px",
  backgroundColor: YELLOW_MEDIUM,
};

// Button style shared by the header's Export / Import controls.
const headerButtonStyle: CSSProperties = {
  backgroundColor: YELLOW_DARK,
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: "13px",
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
  onExportAndShare,
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
  // Id order snapshot at drag start — the basis for the drop-time no-op check
  // (see hasOrderChanged). A ref (not state) so reading it in handleDragEnd
  // never goes stale.
  const dragStartOrderRef = useRef<number[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wire @capacitor/app hardware back button: on the main list route the
  // system Back gesture/button must EXIT the app (without this it walks
  // WebView history or does nothing). Scoped to this route via
  // mount/unmount — mirrors TodoEditPage (which navigates back instead) —
  // so the two handlers never fire together.
  useEffect(() => {
    let removeListener: (() => void) | undefined;
    let mounted = true;

    void (async () => {
      try {
        // Dynamic import — @capacitor/app stays out of the static bundle graph
        const { App: CapApp } = await import("@capacitor/app");
        if (!mounted) return;
        const handle = await CapApp.addListener("backButton", () => {
          void CapApp.exitApp();
        });
        if (!mounted) {
          // Unmounted while registering — drop the orphan listener immediately
          void handle.remove();
          return;
        }
        removeListener = () => { void handle.remove(); };
      } catch {
        // Not running in Capacitor WebView — ignore
      }
    })();

    return () => {
      mounted = false;
      removeListener?.();
    };
  }, []);

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

  function handleDragStart(): void {
    dragStartOrderRef.current = localTodos.map((t) => t.id);
  }

  function handleDragEnd(): void {
    // localTodos is already live-reordered by handleDragOver, so its current
    // id order IS the final order to persist — no `over` needed. Persist iff
    // it differs from the drag-start snapshot (same-position drops skip the
    // N UPDATE "Order" writes + reload for zero change). The .catch keeps a
    // failed persist visible in logcat instead of a silent revert on reload.
    const afterIds = localTodos.map((t) => t.id);
    const beforeIds = dragStartOrderRef.current;
    dragStartOrderRef.current = null;
    if (beforeIds === null || !hasOrderChanged(beforeIds, afterIds)) return;

    // Persist via useTodos.reorder
    void onReorder(afterIds).catch((err: unknown) => {
      console.error("[TodoListPage] reorder persist failed:", err);
    });
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
      {/* Header — add button left, export/import right */}
      <div style={headerStyle}>
        <button
          data-testid="add-button"
          style={addButtonStyle}
          onClick={() => { void navigate("/add"); }}
          aria-label="Add todo"
        >
          +
        </button>
        <div style={headerRightStyle}>
                  <button
                    style={headerButtonStyle}
                    onClick={() => { void onExportAndShare(); }}
                    aria-label="Export todos as JSON"
                  >
                    Export
                  </button>
          <button
            style={headerButtonStyle}
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
      </div>

      {/* List */}
      {loading ? (
        <div style={loadingStyle}>Loading…</div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
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
