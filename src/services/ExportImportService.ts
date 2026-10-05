/**
 * ExportImportService — pure string↔Todo[] transforms.
 *
 * Replicates MAUI Services/ExportImportService.cs + §12 backward-compat contract.
 *
 * No Capacitor Share/Filesystem calls here — those live in the hook/UI layer (Phase 3/4).
 * This service is fully unit-testable with no mocks.
 */
import { createTodo } from "../models/Todo.js";
import type { Todo } from "../models/Todo.js";

// ---------------------------------------------------------------------------
// exportToJson
//
// Serialise the todos array to a JSON string using JSON.stringify with 2-space
// indent (matching MAUI WriteIndented). Emits CAMELCASE keys (the new Todo shape
// — §12.3 forward format). Raw UTF-8; JSON.stringify does NOT \uXXXX-escape
// non-ASCII, which is intentional (§12.1 — round-trip tests must compare
// PARSED VALUES, never raw bytes).
// ---------------------------------------------------------------------------
export function exportToJson(todos: Todo[]): string {
  return JSON.stringify(todos, null, 2);
}

// ---------------------------------------------------------------------------
// importFromJson
//
// Parse a JSON string into a Todo[] with TOLERANT key mapping (PascalCase legacy
// OR camelCase new export). Mirrors MAUI ImportFromJsonAsync + §12 contract:
//
//   1. JSON.parse the string. On ANY parse error or if root is not an array → null.
//   2. Map each object to a Todo using case-insensitive / try-both key lookup.
//      Field resets per §12.2: id → 0; order → 0; createdAt fallback → now.
//   3. REVERSE the resulting array (MAUI reverse-insert semantics — §12.4).
//      Return the reversed Todo[].
//
// CONTRACT FOR CALLER (Phase 3 useTodos hook):
//   importFromJson returns the parsed + reversed todos. Caller must addTodo()
//   each item in array order so they land top-to-bottom in the original sequence
//   (addTodo inserts each at Order=0, shifting others down — net result reproduces
//   the original file order).
// ---------------------------------------------------------------------------
export function importFromJson(json: string): Todo[] | null {
  // Step 1: parse, guard against any error
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return null;
  }

  // Root must be an array
  if (!Array.isArray(parsed)) {
    return null;
  }

  // Step 2: map each object to a Todo with tolerant key lookup
  const todos: Todo[] = parsed.map((item: unknown) => {
    // item must be a non-null object for us to read keys from it
    const obj =
      item !== null && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    // Case-insensitive key lookup: try camelCase first, then PascalCase fallback.
    // This covers both legacy MAUI exports (PascalCase) and new exports (camelCase).
    function pick<T>(camelKey: string, pascalKey: string, fallback: T): T {
      if (Object.prototype.hasOwnProperty.call(obj, camelKey)) {
        return obj[camelKey] as T;
      }
      if (Object.prototype.hasOwnProperty.call(obj, pascalKey)) {
        return obj[pascalKey] as T;
      }
      return fallback;
    }

    // id → reset to 0 (re-inserted as new rows; mirror MAUI item.Id=0)
    // order → reset to 0 (recomputed on insert per MAUI import semantics — §12.4)
    const createdAtRaw = pick<string | null>("createdAt", "CreatedAt", null);

    return createTodo({
      id: 0,
      title: pick<string>("title", "Title", ""),
      description: pick<string | null>("description", "Description", null),
      deadline: pick<string | null>("deadline", "Deadline", null),
      isCompleted: pick<boolean>("isCompleted", "IsCompleted", false),
      order: 0,
      createdAt: createdAtRaw !== null && createdAtRaw !== undefined
        ? String(createdAtRaw)
        : new Date().toISOString(),
      completedAt: pick<string | null>("completedAt", "CompletedAt", null),
    });
  });

  // Step 3: reverse (MAUI reverse-insert semantics — §12.4)
  todos.reverse();

  return todos;
}
