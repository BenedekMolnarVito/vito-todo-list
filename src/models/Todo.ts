/**
 * Todo model — mirrors MAUI Models/TodoItem.cs fields, camelCase.
 *
 * id:          INTEGER PK AUTOINCREMENT (0 = unsaved / not yet inserted)
 * title:       TEXT NOT NULL, ≤200 chars enforced at UI/validation layer
 * description: TEXT nullable
 * deadline:    TEXT nullable, ISO 8601
 * isCompleted: boolean (0|1 in DB)
 * order:       INTEGER NOT NULL DEFAULT 0 — position in the list; 0 = top
 * createdAt:   TEXT NOT NULL, ISO 8601
 * completedAt: TEXT nullable, ISO 8601 — set when isCompleted → true
 */
export interface Todo {
  id: number;
  title: string;
  description: string | null;
  deadline: string | null;
  isCompleted: boolean;
  order: number;
  createdAt: string;
  completedAt: string | null;
}

/**
 * Factory that constructs a Todo with all defaults explicitly set,
 * then overlays the provided partial fields.
 *
 * Defaults:
 *   id          = 0       (unsaved)
 *   title       = ""
 *   description = null
 *   deadline    = null
 *   isCompleted = false
 *   order       = 0       (top)
 *   createdAt   = now (ISO 8601)
 *   completedAt = null
 */
export function createTodo(fields: Partial<Todo> = {}): Todo {
  return {
    id: 0,
    title: "",
    description: null,
    deadline: null,
    isCompleted: false,
    order: 0,
    createdAt: new Date().toISOString(),
    completedAt: null,
    ...fields,
  };
}
