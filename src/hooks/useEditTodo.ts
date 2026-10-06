/**
 * useEditTodo — edit-form state hook for the add/edit screen.
 *
 * Mirrors MAUI TodoEditPage behaviour (plan §8 / task-phase3-brief.md):
 *   - State: title, description, hasDeadline, date, time
 *   - On mount: if id present, load existing todo and split deadline into date+time
 *   - title required + ≤200 chars; save() rejects on invalid with errors.title=true
 *   - deadline composed from date+time ONLY when hasDeadline=true; else null
 *   - save() with no id → addTodo (lands at top); with id → updateTodo
 *
 * No @capacitor/* imports — fully injectable / unit-testable.
 *
 * NOTE for tests: always call setters in one act() block and save() in a
 * SEPARATE act() block so React re-renders between them and save() reads
 * the current state.
 */
import { useState, useEffect, useCallback } from "react";
import type { SqliteExecutor } from "../data/SqliteExecutor.js";
import type { Todo } from "../models/Todo.js";
import { createTodo } from "../models/Todo.js";
import { getTodoById, addTodo, updateTodo } from "../data/TodoRepository.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditErrors {
  /** true when title is empty or >200 chars */
  title: boolean;
  /** true when hasDeadline=true but date or time is missing */
  deadline: boolean;
}

export interface UseEditTodoOptions {
  exec: SqliteExecutor;
  id?: number;
}

export interface UseEditTodoResult {
  // Form state
  title: string;
  description: string;
  hasDeadline: boolean;
  date: string;
  time: string;
  errors: EditErrors;

  // Setters
  setTitle: (v: string) => void;
  setDescription: (v: string) => void;
  setHasDeadline: (v: boolean) => void;
  setDate: (v: string) => void;
  setTime: (v: string) => void;

  // Actions
  /** Save the form: insert (no id) or update (id present).
   *  Returns true on success, false when validation fails. */
  save: () => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split an ISO deadline string "2026-12-25T10:30:00" → { date, time } */
function splitDeadline(iso: string): { date: string; time: string } {
  const tIdx = iso.indexOf("T");
  if (tIdx === -1) return { date: iso, time: "" };
  const datePart = iso.slice(0, tIdx);
  // Take HH:MM only (first 5 chars after T)
  const timePart = iso.slice(tIdx + 1, tIdx + 6);
  return { date: datePart, time: timePart };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useEditTodo({ exec, id }: UseEditTodoOptions): UseEditTodoResult {
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [hasDeadline, setHasDeadline] = useState<boolean>(false);
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [errors, setErrors] = useState<EditErrors>({ title: false, deadline: false });

  // Loaded existing todo (needed for the update path in save())
  const [existingTodo, setExistingTodo] = useState<Todo | null>(null);

  // On mount: if id present, load the todo and populate fields
  useEffect(() => {
    if (id === undefined) return;

    void (async () => {
      const todo = await getTodoById(exec, id);
      if (todo === null) return;

      setExistingTodo(todo);
      setTitle(todo.title);
      setDescription(todo.description ?? "");

      if (todo.deadline !== null) {
        setHasDeadline(true);
        const { date: d, time: t } = splitDeadline(todo.deadline);
        setDate(d);
        setTime(t);
      } else {
        setHasDeadline(false);
        setDate("");
        setTime("");
      }
    })();
  }, [exec, id]);

  // -------------------------------------------------------------------------
  // save — reads current state from the closure (requires React to have
  // re-rendered after any setter calls before save() is invoked).
  // -------------------------------------------------------------------------
  const save = useCallback(async (): Promise<boolean> => {
    const newErrors: EditErrors = { title: false, deadline: false };

    // Validate title
    if (title.trim() === "" || title.length > 200) {
      newErrors.title = true;
    }

    // Validate deadline fields when hasDeadline=true
    if (hasDeadline && (date === "" || time === "")) {
      newErrors.deadline = true;
    }

    if (newErrors.title || newErrors.deadline) {
      setErrors(newErrors);
      return false;
    }

    // Clear errors on valid save
    setErrors({ title: false, deadline: false });

    // Compose deadline
    const deadline: string | null = hasDeadline ? `${date}T${time}` : null;

    if (id === undefined) {
      // INSERT path — addTodo puts item at Order=0 (top)
      await addTodo(
        exec,
        createTodo({
          title: title.trim(),
          description: description !== "" ? description : null,
          deadline,
        })
      );
    } else {
      // UPDATE path — preserve all existing fields, overlay editable ones
      const base = existingTodo ?? createTodo({ id });
      await updateTodo(exec, {
        ...base,
        title: title.trim(),
        description: description !== "" ? description : null,
        deadline,
      });
    }

    return true;
  }, [exec, id, existingTodo, title, description, hasDeadline, date, time]);

  return {
    title,
    description,
    hasDeadline,
    date,
    time,
    errors,
    setTitle,
    setDescription,
    setHasDeadline,
    setDate,
    setTime,
    save,
  };
}
