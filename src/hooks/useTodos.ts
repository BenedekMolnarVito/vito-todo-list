/**
 * useTodos — list orchestrator hook.
 *
 * Owns the Todo[] state the UI renders.  All Capacitor-specific concerns
 * (Share, Filesystem) are injected as callbacks — this file has NO direct
 * @capacitor/* import so it stays unit-testable with a node executor.
 *
 * Exposed interface (plan §8 / task-phase3-brief.md):
 *   { todos, loading, add, update, toggleComplete, remove, reorder,
 *     exportJson, importJson }
 */
import { useState, useEffect, useCallback } from "react";
import type { SqliteExecutor } from "../data/SqliteExecutor.js";
import type { Todo } from "../models/Todo.js";
import { createTodo } from "../models/Todo.js";
import { initDatabase } from "../data/DatabaseService.js";
import {
  getAllTodos,
  addTodo,
  updateTodo,
  deleteTodo,
  updateOrder,
} from "../data/TodoRepository.js";
import { exportToJson, importFromJson } from "../services/ExportImportService.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Confirm callback to gate deletions. */
export type ConfirmFn = (todo: Todo) => Promise<boolean>;

export interface UseTodosOptions {
  exec: SqliteExecutor;
  onDatabaseChanged?: () => void;
}

export interface UseTodosResult {
  todos: Todo[];
  loading: boolean;
  add: (fields: Partial<Omit<Todo, "id" | "order">>) => Promise<void>;
  update: (todo: Todo) => Promise<void>;
  toggleComplete: (id: number) => Promise<void>;
  remove: (id: number, confirm?: ConfirmFn) => Promise<void>;
  reorder: (newIdOrder: number[]) => Promise<void>;
  exportJson: () => string;
  importJson: (json: string) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useTodos({
  exec,
  onDatabaseChanged,
}: UseTodosOptions): UseTodosResult {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Internal load / refresh
  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await getAllTodos(exec);
      setTodos(result);
    } finally {
      setLoading(false);
    }
  }, [exec]);

  // On mount: init DB then load
  useEffect(() => {
    void initDatabase(exec).then(() => load());
  }, [exec, load]);

  // -------------------------------------------------------------------------
  // add
  // -------------------------------------------------------------------------
  const add = useCallback(
    async (fields: Partial<Omit<Todo, "id" | "order">>): Promise<void> => {
      const base = createTodo(fields);
      // createTodo sets id=0 and order=0; drop them for the Omit<...> signature
      const { id: _id, order: _order, ...rest } = base;
      await addTodo(exec, rest);
      await load();
      onDatabaseChanged?.();
    },
    [exec, load, onDatabaseChanged]
  );

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------
  const update = useCallback(
    async (todo: Todo): Promise<void> => {
      await updateTodo(exec, todo);
      await load();
      onDatabaseChanged?.();
    },
    [exec, load, onDatabaseChanged]
  );

  // -------------------------------------------------------------------------
  // toggleComplete
  // Completing: set isCompleted=true, completedAt=now
  // Un-completing: set isCompleted=false, completedAt=null
  // Also enforces Phase-1 minor M4: isCompleted/completedAt consistency.
  // -------------------------------------------------------------------------
  const toggleComplete = useCallback(
    async (id: number): Promise<void> => {
      const todo = todos.find((t) => t.id === id);
      if (!todo) return;

      let updated: Todo;
      if (!todo.isCompleted) {
        // Completing
        updated = {
          ...todo,
          isCompleted: true,
          completedAt: new Date().toISOString(),
        };
      } else {
        // Un-completing
        updated = {
          ...todo,
          isCompleted: false,
          completedAt: null,
        };
      }

      await updateTodo(exec, updated);
      await load();
      onDatabaseChanged?.();
    },
    [exec, todos, load, onDatabaseChanged]
  );

  // -------------------------------------------------------------------------
  // remove
  // Only deletes AFTER the confirm callback resolves true (or if no confirm
  // is provided, deletes immediately).
  // -------------------------------------------------------------------------
  const remove = useCallback(
    async (id: number, confirm?: ConfirmFn): Promise<void> => {
      if (confirm !== undefined) {
        const todo = todos.find((t) => t.id === id);
        if (!todo) return;
        const confirmed = await confirm(todo);
        if (!confirmed) return;
      }

      await deleteTodo(exec, id);
      await load();
      onDatabaseChanged?.();
    },
    [exec, todos, load, onDatabaseChanged]
  );

  // -------------------------------------------------------------------------
  // reorder
  // -------------------------------------------------------------------------
  const reorder = useCallback(
    async (newIdOrder: number[]): Promise<void> => {
      await updateOrder(exec, newIdOrder);
      await load();
      onDatabaseChanged?.();
    },
    [exec, load, onDatabaseChanged]
  );

  // -------------------------------------------------------------------------
  // exportJson — pure; no share involved
  // -------------------------------------------------------------------------
  const exportJson = useCallback((): string => {
    return exportToJson(todos);
  }, [todos]);

  // -------------------------------------------------------------------------
  // importJson
  // importFromJson already reverses the list; caller (this hook) must
  // addTodo each in array order so they land top-to-bottom in original order
  // (§12.4).
  // -------------------------------------------------------------------------
  const importJson = useCallback(
    async (json: string): Promise<boolean> => {
      const parsed = importFromJson(json);
      if (parsed === null) return false;

      for (const todo of parsed) {
        const { id: _id, order: _order, ...rest } = todo;
        await addTodo(exec, rest);
      }

      await load();
      onDatabaseChanged?.();
      return true;
    },
    [exec, load, onDatabaseChanged]
  );

  return {
    todos,
    loading,
    add,
    update,
    toggleComplete,
    remove,
    reorder,
    exportJson,
    importJson,
  };
  }
