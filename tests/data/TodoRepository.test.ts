/**
 * TodoRepository tests (TDD — written before verifying the implementation).
 *
 * Covers (per task-phase1-brief.md §Tests FIRST):
 *   - addTodo: new item at Order 0, all existing shifted +1; returns valid id
 *   - getAllTodos: ORDER BY "Order" ASC, CreatedAt DESC
 *   - updateOrder: rewrites Order = index; getAllTodos reflects it
 *   - deadline auto-complete: past deadline → isCompleted=true + completedAt set + PERSISTED
 *   - future / null deadline → not auto-completed
 *   - getTodoById, updateTodo, deleteTodo round-trip (nulls, isCompleted 0|1 mapping)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createNodeExecutor } from "../helpers/nodeExecutor.js";
import { initDatabase } from "../../src/data/DatabaseService.js";
import {
  addTodo,
  getAllTodos,
  getTodoById,
  updateTodo,
  deleteTodo,
  updateOrder,
} from "../../src/data/TodoRepository.js";
import type { SqliteExecutor } from "../../src/data/SqliteExecutor.js";
import type { Todo } from "../../src/models/Todo.js";

// ---------------------------------------------------------------------------
// Fixture factories
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
// Setup / teardown
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
// addTodo
// ---------------------------------------------------------------------------
describe("addTodo", () => {
  it("returns a valid (non-zero) id", async () => {
    const id = await addTodo(exec, makeTodoInput());
    expect(id).toBeGreaterThan(0);
  });

  it("inserts the new item at Order 0", async () => {
    const id = await addTodo(exec, makeTodoInput({ title: "first" }));
    const todo = await getTodoById(exec, id);
    expect(todo?.order).toBe(0);
  });

  it("shifts ALL existing items Order +1 when a new item is added", async () => {
    // Add three items sequentially
    const id1 = await addTodo(exec, makeTodoInput({ title: "A" }));
    const id2 = await addTodo(exec, makeTodoInput({ title: "B" }));
    const id3 = await addTodo(exec, makeTodoInput({ title: "C" }));

    // After third insert: A=2, B=1, C=0 (newest always at 0)
    const a = await getTodoById(exec, id1);
    const b = await getTodoById(exec, id2);
    const c = await getTodoById(exec, id3);
    expect(c?.order).toBe(0);
    expect(b?.order).toBe(1);
    expect(a?.order).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getAllTodos ordering
// ---------------------------------------------------------------------------
describe("getAllTodos ordering", () => {
  it('returns items sorted by Order ASC, then CreatedAt DESC', async () => {
    // Add three items; they land at Order 0,1,2 in insertion order reversed
    // (each push shifts existing ones up)
    const id1 = await addTodo(
      exec,
      makeTodoInput({ title: "first", createdAt: "2026-01-01T10:00:00.000Z" })
    );
    const id2 = await addTodo(
      exec,
      makeTodoInput({ title: "second", createdAt: "2026-01-02T10:00:00.000Z" })
    );
    const id3 = await addTodo(
      exec,
      makeTodoInput({ title: "third", createdAt: "2026-01-03T10:00:00.000Z" })
    );

    // After three inserts:
    //   id3 Order=0, id2 Order=1, id1 Order=2
    const todos = await getAllTodos(exec);
    expect(todos[0]?.id).toBe(id3);
    expect(todos[1]?.id).toBe(id2);
    expect(todos[2]?.id).toBe(id1);
  });

  it('CreatedAt DESC tiebreaker: same Order returns newest createdAt first', async () => {
    // Manually insert two rows with the same Order value but different CreatedAt
    await exec.run(
      `INSERT INTO Todos (Title, IsCompleted, "Order", CreatedAt)
       VALUES (?, 0, 5, ?)`,
      ["older", "2026-01-01T00:00:00.000Z"]
    );
    await exec.run(
      `INSERT INTO Todos (Title, IsCompleted, "Order", CreatedAt)
       VALUES (?, 0, 5, ?)`,
      ["newer", "2026-01-02T00:00:00.000Z"]
    );

    const todos = await getAllTodos(exec);
    expect(todos[0]?.title).toBe("newer");
    expect(todos[1]?.title).toBe("older");
  });
});

// ---------------------------------------------------------------------------
// updateOrder
// ---------------------------------------------------------------------------
describe("updateOrder", () => {
  it("rewrites Order = index for the given id sequence", async () => {
    const id1 = await addTodo(exec, makeTodoInput({ title: "A" }));
    const id2 = await addTodo(exec, makeTodoInput({ title: "B" }));
    const id3 = await addTodo(exec, makeTodoInput({ title: "C" }));

    // Reverse the order: C→0, B→1, A→2
    await updateOrder(exec, [id1, id2, id3]);

    const t1 = await getTodoById(exec, id1);
    const t2 = await getTodoById(exec, id2);
    const t3 = await getTodoById(exec, id3);
    expect(t1?.order).toBe(0);
    expect(t2?.order).toBe(1);
    expect(t3?.order).toBe(2);
  });

  it("getAllTodos reflects updated order after updateOrder", async () => {
    const id1 = await addTodo(exec, makeTodoInput({ title: "X" }));
    const id2 = await addTodo(exec, makeTodoInput({ title: "Y" }));
    const id3 = await addTodo(exec, makeTodoInput({ title: "Z" }));

    // Set order: id1=0, id2=1, id3=2
    await updateOrder(exec, [id1, id2, id3]);

    const todos = await getAllTodos(exec);
    expect(todos[0]?.id).toBe(id1);
    expect(todos[1]?.id).toBe(id2);
    expect(todos[2]?.id).toBe(id3);
  });
});

// ---------------------------------------------------------------------------
// Deadline auto-complete
// ---------------------------------------------------------------------------
describe("deadline auto-complete (getAllTodos)", () => {
  it("auto-completes an item with a PAST deadline and persists the flip", async () => {
    const pastDeadline = "2000-01-01T00:00:00.000Z"; // well in the past
    const id = await addTodo(
      exec,
      makeTodoInput({ title: "overdue", deadline: pastDeadline })
    );

    // Call getAllTodos — should trigger auto-complete
    const todos = await getAllTodos(exec);
    const returned = todos.find((t) => t.id === id);
    expect(returned?.isCompleted).toBe(true);
    expect(returned?.completedAt).not.toBeNull();

    // Re-query to verify persistence
    const persisted = await getTodoById(exec, id);
    expect(persisted?.isCompleted).toBe(true);
    expect(persisted?.completedAt).not.toBeNull();
  });

  it("does NOT auto-complete an item with a FUTURE deadline", async () => {
    const futureDeadline = "2099-12-31T23:59:59.000Z";
    const id = await addTodo(
      exec,
      makeTodoInput({ title: "future", deadline: futureDeadline })
    );

    const todos = await getAllTodos(exec);
    const t = todos.find((t) => t.id === id);
    expect(t?.isCompleted).toBe(false);
    expect(t?.completedAt).toBeNull();

    const persisted = await getTodoById(exec, id);
    expect(persisted?.isCompleted).toBe(false);
  });

  it("does NOT auto-complete an item with a null deadline", async () => {
    const id = await addTodo(
      exec,
      makeTodoInput({ title: "no deadline", deadline: null })
    );

    const todos = await getAllTodos(exec);
    const t = todos.find((t) => t.id === id);
    expect(t?.isCompleted).toBe(false);

    const persisted = await getTodoById(exec, id);
    expect(persisted?.isCompleted).toBe(false);
  });

  it("already-completed item with past deadline keeps its existing completedAt", async () => {
    const pastDeadline = "2000-01-01T00:00:00.000Z";
    const existingCompletedAt = "2001-06-15T12:00:00.000Z";
    const id = await addTodo(
      exec,
      makeTodoInput({
        title: "already done",
        deadline: pastDeadline,
        isCompleted: true,
        completedAt: existingCompletedAt,
      })
    );

    const todos = await getAllTodos(exec);
    const t = todos.find((t) => t.id === id);
    // Stays completed; auto-complete branch is NOT triggered (already isCompleted)
    expect(t?.isCompleted).toBe(true);
    // completedAt should be unchanged (the existing value, not overwritten)
    expect(t?.completedAt).toBe(existingCompletedAt);
  });

  // -------------------------------------------------------------------------
  // Regression: local-no-Z (minute-precision) deadlines — the format the app
  // ACTUALLY stores via useEditTodo `${date}T${time}` (e.g. "2026-12-25T17:00").
  //
  // The former impl did `todo.deadline <= now` where now = toISOString() (UTC-Z,
  // sub-second). That is a LEXICOGRAPHIC compare of mismatched formats, not a
  // chronological one, so a wall-clock-past local deadline could read as "not
  // past" near the boundary. The existing fixtures above all use Z-suffixed
  // UTC strings and so never exercised this. These do.
  // -------------------------------------------------------------------------

  /** Format a Date as the app's stored deadline: local, no Z, minute precision. */
  function toLocalNoZMinute(d: Date): string {
    const pad = (n: number): string => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  }

  it("auto-completes a local-no-Z deadline that is wall-clock PAST (BUG regression)", async () => {
    // 90 minutes in the past, local wall clock, stored as "YYYY-MM-DDThh:mm".
    const pastLocal = toLocalNoZMinute(new Date(Date.now() - 90 * 60 * 1000));
    const id = await addTodo(
      exec,
      makeTodoInput({ title: "overdue local-no-Z", deadline: pastLocal })
    );

    const todos = await getAllTodos(exec);
    const returned = todos.find((t) => t.id === id);
    expect(returned?.isCompleted).toBe(true);
    expect(returned?.completedAt).not.toBeNull();

    const persisted = await getTodoById(exec, id);
    expect(persisted?.isCompleted).toBe(true);
  });

  it("does NOT auto-complete a local-no-Z deadline that is wall-clock FUTURE", async () => {
    // 90 minutes in the future, local wall clock.
    const futureLocal = toLocalNoZMinute(new Date(Date.now() + 90 * 60 * 1000));
    const id = await addTodo(
      exec,
      makeTodoInput({ title: "upcoming local-no-Z", deadline: futureLocal })
    );

    const todos = await getAllTodos(exec);
    const t = todos.find((t) => t.id === id);
    expect(t?.isCompleted).toBe(false);
    expect(t?.completedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getTodoById
// ---------------------------------------------------------------------------
describe("getTodoById", () => {
  it("returns null for a non-existent id", async () => {
    const result = await getTodoById(exec, 9999);
    expect(result).toBeNull();
  });

  it("returns the correct todo including null fields", async () => {
    const id = await addTodo(
      exec,
      makeTodoInput({
        title: "hello",
        description: null,
        deadline: null,
        completedAt: null,
      })
    );
    const todo = await getTodoById(exec, id);
    expect(todo).not.toBeNull();
    expect(todo?.title).toBe("hello");
    expect(todo?.description).toBeNull();
    expect(todo?.deadline).toBeNull();
    expect(todo?.completedAt).toBeNull();
    expect(todo?.isCompleted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateTodo
// ---------------------------------------------------------------------------
describe("updateTodo", () => {
  it("persists updated title, description, deadline, isCompleted, completedAt", async () => {
    const createdAt = "2026-06-01T10:00:00.000Z";
    const id = await addTodo(
      exec,
      makeTodoInput({ title: "original", createdAt })
    );

    const original = await getTodoById(exec, id);
    if (!original) throw new Error("todo not found");

    const updated: Todo = {
      ...original,
      title: "updated",
      description: "a description",
      deadline: "2026-12-31T23:59:00.000Z",
      isCompleted: true,
      completedAt: "2026-07-01T09:00:00.000Z",
    };

    await updateTodo(exec, updated);

    const fetched = await getTodoById(exec, id);
    expect(fetched?.title).toBe("updated");
    expect(fetched?.description).toBe("a description");
    expect(fetched?.deadline).toBe("2026-12-31T23:59:00.000Z");
    expect(fetched?.isCompleted).toBe(true);
    expect(fetched?.completedAt).toBe("2026-07-01T09:00:00.000Z");
  });

  it("correctly maps isCompleted false → 0 and true → 1 round-trip", async () => {
    const id = await addTodo(exec, makeTodoInput({ isCompleted: false }));
    const todo = await getTodoById(exec, id);
    if (!todo) throw new Error("todo not found");

    // Flip to true
    await updateTodo(exec, { ...todo, isCompleted: true });
    const flipped = await getTodoById(exec, id);
    expect(flipped?.isCompleted).toBe(true);

    // Flip back to false
    await updateTodo(exec, { ...flipped!, isCompleted: false });
    const unflipped = await getTodoById(exec, id);
    expect(unflipped?.isCompleted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteTodo
// ---------------------------------------------------------------------------
describe("deleteTodo", () => {
  it("removes the todo from the DB", async () => {
    const id = await addTodo(exec, makeTodoInput());
    await deleteTodo(exec, id);
    const result = await getTodoById(exec, id);
    expect(result).toBeNull();
  });

  it("does not throw when deleting a non-existent id", async () => {
    await expect(deleteTodo(exec, 9999)).resolves.toBeUndefined();
  });
});
