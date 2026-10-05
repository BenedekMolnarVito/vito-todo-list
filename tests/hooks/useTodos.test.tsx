/**
 * useTodos hook tests (TDD — written before the implementation).
 *
 * Coverage per task-phase3-brief.md §Tests FIRST:
 *   - add → new todo at top of `todos`
 *   - toggleComplete(id): completing sets completedAt≈now and isCompleted true + persists;
 *     un-completing sets completedAt null
 *   - remove(id): with confirm resolving FALSE → todo still present;
 *     with confirm TRUE → gone
 *   - reorder(newIdOrder) → updateOrder called, `todos` reflects the new order
 *   - exportJson returns valid JSON of current todos
 *   - importJson(validJson) → true + todos re-inserted in original order
 *   - importJson(invalid) → false + NO DB mutation (count unchanged)
 *   - share path: shareExport calls the injected share fn with the exported JSON
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createNodeExecutor } from "../helpers/nodeExecutor.js";
import { initDatabase } from "../../src/data/DatabaseService.js";
import { getAllTodos } from "../../src/data/TodoRepository.js";
import { exportToJson } from "../../src/services/ExportImportService.js";
import { useTodos } from "../../src/hooks/useTodos.js";
import type { SqliteExecutor } from "../../src/data/SqliteExecutor.js";
import type { Todo } from "../../src/models/Todo.js";

// ---------------------------------------------------------------------------
// Setup / teardown — fresh in-memory DB per test
// ---------------------------------------------------------------------------
let exec: SqliteExecutor;
let close: () => void;

beforeEach(async () => {
  ({ exec, close } = createNodeExecutor());
  await initDatabase(exec);
});

afterEach(() => {
  close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeTodoInput(
  overrides: Partial<Omit<Todo, "id" | "order">> = {}
): Omit<Todo, "id" | "order"> {
  return {
    title: "Test todo",
    description: null,
    deadline: null,
    isCompleted: false,
    createdAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("useTodos", () => {
  it("loads an empty list on mount", async () => {
    const { result } = renderHook(() => useTodos({ exec }));

    // Wait for initial load to complete
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.todos).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("add → new todo appears at top of todos", async () => {
    const { result } = renderHook(() => useTodos({ exec }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.add({ title: "First" });
    });

    expect(result.current.todos).toHaveLength(1);
    expect(result.current.todos[0]?.title).toBe("First");

    await act(async () => {
      await result.current.add({ title: "Second" });
    });

    expect(result.current.todos).toHaveLength(2);
    // Second todo should be at the top (Order=0)
    expect(result.current.todos[0]?.title).toBe("Second");
    expect(result.current.todos[1]?.title).toBe("First");
  });

  it("update → persists updated fields", async () => {
    const { result } = renderHook(() => useTodos({ exec }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.add({ title: "Original" });
    });

    const todo = result.current.todos[0]!;

    await act(async () => {
      await result.current.update({ ...todo, title: "Updated" });
    });

    expect(result.current.todos[0]?.title).toBe("Updated");
  });

  it("toggleComplete: completing sets isCompleted=true and completedAt≈now", async () => {
    const { result } = renderHook(() => useTodos({ exec }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.add({ title: "Toggle me" });
    });

    const todo = result.current.todos[0]!;
    expect(todo.isCompleted).toBe(false);
    expect(todo.completedAt).toBeNull();

    const beforeToggle = new Date().toISOString();

    await act(async () => {
      await result.current.toggleComplete(todo.id);
    });

    const toggled = result.current.todos[0]!;
    expect(toggled.isCompleted).toBe(true);
    expect(toggled.completedAt).not.toBeNull();
    // completedAt should be >= beforeToggle (i.e. set to approximately now)
    expect(toggled.completedAt! >= beforeToggle).toBe(true);

    // Also verify it persisted by querying DB directly
    const dbTodos = await getAllTodos(exec);
    expect(dbTodos[0]?.isCompleted).toBe(true);
    expect(dbTodos[0]?.completedAt).not.toBeNull();
  });

  it("toggleComplete: un-completing sets isCompleted=false and completedAt=null", async () => {
    const { result } = renderHook(() => useTodos({ exec }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.add({ title: "Already done", isCompleted: true, completedAt: new Date().toISOString() });
    });

    // The add may have auto-completed or not, but let's toggleComplete to true first
    const todo = result.current.todos[0]!;

    // Ensure it is completed first
    if (!todo.isCompleted) {
      await act(async () => {
        await result.current.toggleComplete(todo.id);
      });
    }
    expect(result.current.todos[0]?.isCompleted).toBe(true);

    // Now un-complete
    await act(async () => {
      await result.current.toggleComplete(result.current.todos[0]!.id);
    });

    const uncompleted = result.current.todos[0]!;
    expect(uncompleted.isCompleted).toBe(false);
    expect(uncompleted.completedAt).toBeNull();

    // Verify persisted
    const dbTodos = await getAllTodos(exec);
    expect(dbTodos[0]?.completedAt).toBeNull();
  });

  it("remove with confirm=false → todo NOT deleted", async () => {
    const { result } = renderHook(() => useTodos({ exec }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.add({ title: "Keep me" });
    });

    const todo = result.current.todos[0]!;
    const confirmFalse = vi.fn().mockResolvedValue(false);

    await act(async () => {
      await result.current.remove(todo.id, confirmFalse);
    });

    expect(confirmFalse).toHaveBeenCalledWith(todo);
    expect(result.current.todos).toHaveLength(1);
    expect(result.current.todos[0]?.title).toBe("Keep me");
  });

  it("remove with confirm=true → todo deleted", async () => {
    const { result } = renderHook(() => useTodos({ exec }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.add({ title: "Delete me" });
    });

    const todo = result.current.todos[0]!;
    const confirmTrue = vi.fn().mockResolvedValue(true);

    await act(async () => {
      await result.current.remove(todo.id, confirmTrue);
    });

    expect(confirmTrue).toHaveBeenCalledWith(todo);
    expect(result.current.todos).toHaveLength(0);
  });

  it("remove without confirm fn → deletes immediately", async () => {
    const { result } = renderHook(() => useTodos({ exec }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.add({ title: "No confirm needed" });
    });

    const todo = result.current.todos[0]!;

    await act(async () => {
      await result.current.remove(todo.id);
    });

    expect(result.current.todos).toHaveLength(0);
  });

  it("reorder → todos reflect the new order", async () => {
    const { result } = renderHook(() => useTodos({ exec }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.add({ title: "A" });
    });
    await act(async () => {
      await result.current.add({ title: "B" });
    });
    await act(async () => {
      await result.current.add({ title: "C" });
    });

    // After adds: C(top), B, A
    expect(result.current.todos[0]?.title).toBe("C");
    expect(result.current.todos[1]?.title).toBe("B");
    expect(result.current.todos[2]?.title).toBe("A");

    const ids = result.current.todos.map((t) => t.id);
    // Reverse order: A, B, C
    const newOrder = [ids[2]!, ids[1]!, ids[0]!];

    await act(async () => {
      await result.current.reorder(newOrder);
    });

    expect(result.current.todos[0]?.title).toBe("A");
    expect(result.current.todos[1]?.title).toBe("B");
    expect(result.current.todos[2]?.title).toBe("C");
  });

  it("exportJson returns valid JSON of current todos", async () => {
    const { result } = renderHook(() => useTodos({ exec }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.add({ title: "Export me" });
    });

    const json = result.current.exportJson();
    const parsed = JSON.parse(json) as unknown;

    expect(Array.isArray(parsed)).toBe(true);
    const arr = parsed as Todo[];
    expect(arr).toHaveLength(1);
    expect(arr[0]?.title).toBe("Export me");
  });

  it("importJson(validJson) → returns true + todos re-inserted in original order", async () => {
    const { result } = renderHook(() => useTodos({ exec }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Create some todos to export
    await act(async () => {
      await result.current.add({ title: "First" });
    });
    await act(async () => {
      await result.current.add({ title: "Second" });
    });
    await act(async () => {
      await result.current.add({ title: "Third" });
    });

    // Export: todos are now [Third, Second, First] in the state
    const json = exportToJson(result.current.todos);

    // Clear the DB by removing all todos
    for (const todo of [...result.current.todos]) {
      await act(async () => {
        await result.current.remove(todo.id);
      });
    }

    expect(result.current.todos).toHaveLength(0);

    // Import
    let importResult: boolean | undefined;
    await act(async () => {
      importResult = await result.current.importJson(json);
    });

    expect(importResult).toBe(true);
    expect(result.current.todos).toHaveLength(3);

    // The exported json has [Third, Second, First] (state order when exported)
    // importFromJson reverses it → [First, Second, Third], then addTodo each
    // Each addTodo places at top, so final order is: Third, Second, First
    // (the original add order is preserved)
    expect(result.current.todos[0]?.title).toBe("Third");
    expect(result.current.todos[1]?.title).toBe("Second");
    expect(result.current.todos[2]?.title).toBe("First");
  });

  it("importJson(null-ish/invalid) → returns false + NO DB mutation", async () => {
    const { result } = renderHook(() => useTodos({ exec }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.add({ title: "Existing" });
    });

    expect(result.current.todos).toHaveLength(1);

    let importResult: boolean | undefined;
    await act(async () => {
      importResult = await result.current.importJson("not valid json {{{");
    });

    expect(importResult).toBe(false);
    // DB unchanged
    expect(result.current.todos).toHaveLength(1);
    expect(result.current.todos[0]?.title).toBe("Existing");
  });

  it("shareExport calls the injected share fn with the exported JSON", async () => {
    const shareFn = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useTodos({ exec, share: shareFn })
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.add({ title: "Share this" });
    });

    await act(async () => {
      await result.current.shareExport();
    });

    expect(shareFn).toHaveBeenCalledTimes(1);
    // share fn was called with an object containing the JSON text
    const callArg = shareFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof callArg).toBe("object");
    // The JSON text passed should contain our todo title
    const textArg = (callArg.text ?? callArg.title ?? "") as string;
    expect(textArg).toContain("Share this");
  });

  it("onDatabaseChanged is called after every mutation", async () => {
    const onDatabaseChanged = vi.fn();

    const { result } = renderHook(() =>
      useTodos({ exec, onDatabaseChanged })
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.add({ title: "Trigger" });
    });

    expect(onDatabaseChanged).toHaveBeenCalledTimes(1);

    const todo = result.current.todos[0]!;

    await act(async () => {
      await result.current.update({ ...todo, title: "Updated" });
    });

    expect(onDatabaseChanged).toHaveBeenCalledTimes(2);

    await act(async () => {
      await result.current.toggleComplete(todo.id);
    });

    expect(onDatabaseChanged).toHaveBeenCalledTimes(3);

    await act(async () => {
      await result.current.remove(todo.id);
    });

    expect(onDatabaseChanged).toHaveBeenCalledTimes(4);
  });
});
