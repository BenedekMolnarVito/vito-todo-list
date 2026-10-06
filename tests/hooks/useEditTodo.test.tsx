/**
 * useEditTodo hook tests (TDD — written before the implementation).
 *
 * Coverage per task-phase3-brief.md §Tests FIRST:
 *   - title empty or >200 → save rejected, validation flag set, nothing persisted
 *   - hasDeadline false → deadline null on save
 *   - hasDeadline true with date+time → correct ISO deadline
 *   - save with no id inserts (lands at top)
 *   - save with id updates the existing row
 *
 * IMPORTANT: setters and save() MUST be in separate act() blocks so React
 * re-renders between them (save() reads current state from its closure).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createNodeExecutor } from "../helpers/nodeExecutor.js";
import { initDatabase } from "../../src/data/DatabaseService.js";
import {
  addTodo,
  getAllTodos,
  getTodoById,
} from "../../src/data/TodoRepository.js";
import { useEditTodo } from "../../src/hooks/useEditTodo.js";
import { createTodo } from "../../src/models/Todo.js";
import type { SqliteExecutor } from "../../src/data/SqliteExecutor.js";

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
// Tests
// ---------------------------------------------------------------------------
describe("useEditTodo", () => {
  it("starts with empty state when no id provided", () => {
    const { result } = renderHook(() => useEditTodo({ exec }));

    expect(result.current.title).toBe("");
    expect(result.current.description).toBe("");
    expect(result.current.hasDeadline).toBe(false);
    expect(result.current.date).toBe("");
    expect(result.current.time).toBe("");
    expect(result.current.errors.title).toBe(false);
  });

  it("loads existing todo fields when id is provided", async () => {
    // Insert a todo first
    const newId = await addTodo(
      exec,
      createTodo({
        title: "Existing todo",
        description: "Some description",
        deadline: "2026-12-25T10:30:00",
        isCompleted: false,
      })
    );

    const { result } = renderHook(() => useEditTodo({ exec, id: newId }));

    // Wait for load
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.title).toBe("Existing todo");
    expect(result.current.description).toBe("Some description");
    expect(result.current.hasDeadline).toBe(true);
    expect(result.current.date).toBe("2026-12-25");
    expect(result.current.time).toBe("10:30");
  });

  it("existing todo with null deadline → hasDeadline=false", async () => {
    const newId = await addTodo(
      exec,
      createTodo({
        title: "No deadline",
        deadline: null,
      })
    );

    const { result } = renderHook(() => useEditTodo({ exec, id: newId }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.hasDeadline).toBe(false);
    expect(result.current.date).toBe("");
    expect(result.current.time).toBe("");
  });

  it("title empty → save rejected, errors.title=true, nothing persisted", async () => {
    const { result } = renderHook(() => useEditTodo({ exec }));

    // title is already "" — save directly
    let saveResult: boolean | undefined;
    await act(async () => {
      saveResult = await result.current.save();
    });

    expect(saveResult).toBe(false);
    expect(result.current.errors.title).toBe(true);

    // Nothing inserted
    const todos = await getAllTodos(exec);
    expect(todos).toHaveLength(0);
  });

  it("title >200 chars → save rejected, errors.title=true, nothing persisted", async () => {
    const { result } = renderHook(() => useEditTodo({ exec }));

    // Setter in its own act() so React re-renders before save()
    act(() => {
      result.current.setTitle("A".repeat(201));
    });

    let saveResult: boolean | undefined;
    await act(async () => {
      saveResult = await result.current.save();
    });

    expect(saveResult).toBe(false);
    expect(result.current.errors.title).toBe(true);

    // Nothing inserted
    const todos = await getAllTodos(exec);
    expect(todos).toHaveLength(0);
  });

  it("title exactly 200 chars → save succeeds", async () => {
    const { result } = renderHook(() => useEditTodo({ exec }));

    act(() => {
      result.current.setTitle("A".repeat(200));
    });

    let saveResult: boolean | undefined;
    await act(async () => {
      saveResult = await result.current.save();
    });

    expect(saveResult).toBe(true);
    expect(result.current.errors.title).toBe(false);

    const todos = await getAllTodos(exec);
    expect(todos).toHaveLength(1);
    expect(todos[0]?.title).toBe("A".repeat(200));
  });

  it("hasDeadline false → deadline=null on save", async () => {
    const { result } = renderHook(() => useEditTodo({ exec }));

    act(() => {
      result.current.setTitle("No deadline todo");
      result.current.setHasDeadline(false);
      result.current.setDate("2026-12-25");
      result.current.setTime("10:30");
    });

    await act(async () => {
      await result.current.save();
    });

    const todos = await getAllTodos(exec);
    expect(todos[0]?.deadline).toBeNull();
  });

  it("hasDeadline true with date+time → correct ISO deadline", async () => {
    const { result } = renderHook(() => useEditTodo({ exec }));

    act(() => {
      result.current.setTitle("With deadline");
      result.current.setHasDeadline(true);
      result.current.setDate("2026-12-25");
      result.current.setTime("10:30");
    });

    await act(async () => {
      await result.current.save();
    });

    const todos = await getAllTodos(exec);
    expect(todos[0]?.deadline).toBe("2026-12-25T10:30");
  });

  it("hasDeadline true but missing time → save rejected", async () => {
    const { result } = renderHook(() => useEditTodo({ exec }));

    act(() => {
      result.current.setTitle("With deadline but no time");
      result.current.setHasDeadline(true);
      result.current.setDate("2026-12-25");
      result.current.setTime(""); // missing time
    });

    let saveResult: boolean | undefined;
    await act(async () => {
      saveResult = await result.current.save();
    });

    expect(saveResult).toBe(false);
    const todos = await getAllTodos(exec);
    expect(todos).toHaveLength(0);
  });

  it("save with no id → inserts new todo (lands at top)", async () => {
    // Pre-insert a todo so we can check "at top"
    await addTodo(exec, createTodo({ title: "Pre-existing" }));

    const { result } = renderHook(() => useEditTodo({ exec }));

    act(() => {
      result.current.setTitle("New from hook");
    });

    await act(async () => {
      await result.current.save();
    });

    const todos = await getAllTodos(exec);
    expect(todos).toHaveLength(2);
    expect(todos[0]?.title).toBe("New from hook");
    expect(todos[1]?.title).toBe("Pre-existing");
  });

  it("save with id → updates the existing row", async () => {
    const existingId = await addTodo(
      exec,
      createTodo({ title: "Original title", description: "Old desc" })
    );

    const { result } = renderHook(() => useEditTodo({ exec, id: existingId }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    act(() => {
      result.current.setTitle("Updated title");
      result.current.setDescription("New desc");
    });

    await act(async () => {
      await result.current.save();
    });

    const updated = await getTodoById(exec, existingId);
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe("Updated title");
    expect(updated!.description).toBe("New desc");

    // Should still be only one todo
    const todos = await getAllTodos(exec);
    expect(todos).toHaveLength(1);
  });

  it("setters update state correctly", () => {
    const { result } = renderHook(() => useEditTodo({ exec }));

    act(() => {
      result.current.setTitle("My Title");
      result.current.setDescription("My Desc");
      result.current.setHasDeadline(true);
      result.current.setDate("2026-06-01");
      result.current.setTime("09:00");
    });

    expect(result.current.title).toBe("My Title");
    expect(result.current.description).toBe("My Desc");
    expect(result.current.hasDeadline).toBe(true);
    expect(result.current.date).toBe("2026-06-01");
    expect(result.current.time).toBe("09:00");
  });

  it("valid save clears errors.title", async () => {
    const { result } = renderHook(() => useEditTodo({ exec }));

    // First trigger error: title is "" by default, just save
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.errors.title).toBe(true);

    // Fix the title in its own act() so React re-renders
    act(() => {
      result.current.setTitle("Valid title");
    });

    // Now save in a separate act()
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.errors.title).toBe(false);
  });
});
