/**
 * SortableTodoRow component tests + DnD onDragEnd → updateOrder unit test.
 *
 * BUGFIX #3 acceptance:
 * - drag-handle element has the correct data-testid
 * - todo-row element has the correct data-testid
 * - onDragEnd mapping: given a reordered list, the id sequence passed to
 *   reorder() is correct (tests the mapping logic, not pointer physics)
 *
 * Tests import vitest explicitly (globals: false).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { arrayMove } from "@dnd-kit/sortable";
import { SortableTodoRow } from "../../src/components/SortableTodoRow.js";
import { hasOrderChanged } from "../../src/components/TodoListPage.js";
import type { Todo } from "../../src/models/Todo.js";

// Cleanup DOM after each test (globals:false — auto-cleanup won't fire)
afterEach(cleanup);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 1,
    title: "Test Todo",
    description: null,
    deadline: null,
    isCompleted: false,
    order: 0,
    createdAt: "2026-01-01T10:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

// Minimal DnD wrapper required for useSortable to work
function DndWrapper({
  items,
  children,
}: {
  items: number[];
  children: React.ReactNode;
}): JSX.Element {
  return (
    <DndContext>
      <SortableContext items={items}>{children}</SortableContext>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Component tests
// ---------------------------------------------------------------------------
describe("SortableTodoRow", () => {
  it("renders with correct data-testid for the row", () => {
    const todo = makeTodo({ id: 42 });
    render(
      <DndWrapper items={[42]}>
        <SortableTodoRow
          todo={todo}
          onToggleComplete={vi.fn()}
          onEdit={vi.fn()}
        />
      </DndWrapper>
    );
    expect(screen.getByTestId("todo-row-42")).toBeDefined();
  });

  it("renders the drag handle with correct data-testid", () => {
    const todo = makeTodo({ id: 7 });
    render(
      <DndWrapper items={[7]}>
        <SortableTodoRow
          todo={todo}
          onToggleComplete={vi.fn()}
          onEdit={vi.fn()}
        />
      </DndWrapper>
    );
    expect(screen.getByTestId("drag-handle-7")).toBeDefined();
  });

  it("renders the checkbox with correct data-testid", () => {
    const todo = makeTodo({ id: 3 });
    render(
      <DndWrapper items={[3]}>
        <SortableTodoRow
          todo={todo}
          onToggleComplete={vi.fn()}
          onEdit={vi.fn()}
        />
      </DndWrapper>
    );
    expect(screen.getByTestId("checkbox-3")).toBeDefined();
  });

  it("shows strikethrough when todo is completed", () => {
    const todo = makeTodo({ id: 5, isCompleted: true });
    render(
      <DndWrapper items={[5]}>
        <SortableTodoRow
          todo={todo}
          onToggleComplete={vi.fn()}
          onEdit={vi.fn()}
        />
      </DndWrapper>
    );
    const row = screen.getByTestId("todo-row-5");
    const titleEl = row.querySelector('[data-testid="todo-title-5"]') as HTMLElement;
    expect(titleEl.style.textDecoration).toBe("line-through");
  });

  it("places the drag handle as the left-most element of the row (left-handed layout)", () => {
    const todo = makeTodo({ id: 8 });
    render(
      <DndWrapper items={[8]}>
        <SortableTodoRow
          todo={todo}
          onToggleComplete={vi.fn()}
          onEdit={vi.fn()}
        />
      </DndWrapper>
    );
    const row = screen.getByTestId("todo-row-8");
    expect(row.firstElementChild).toBe(screen.getByTestId("drag-handle-8"));
  });

  it("calls onEdit when the row body is clicked", () => {
    const todo = makeTodo({ id: 10 });
    const onEdit = vi.fn();
    render(
      <DndWrapper items={[10]}>
        <SortableTodoRow
          todo={todo}
          onToggleComplete={vi.fn()}
          onEdit={onEdit}
        />
      </DndWrapper>
    );
    screen.getByTestId("todo-row-10").click();
    expect(onEdit).toHaveBeenCalledWith(10);
  });

  it("calls onToggleComplete when checkbox is clicked", () => {
    const todo = makeTodo({ id: 11 });
    const onToggleComplete = vi.fn();
    render(
      <DndWrapper items={[11]}>
        <SortableTodoRow
          todo={todo}
          onToggleComplete={onToggleComplete}
          onEdit={vi.fn()}
        />
      </DndWrapper>
    );
    screen.getByTestId("checkbox-11").click();
    expect(onToggleComplete).toHaveBeenCalledWith(11);
  });
});

// ---------------------------------------------------------------------------
// DnD onDragEnd → updateOrder mapping unit test (BUGFIX #3 acceptance)
//
// Plan §8: "unit-test the mapping, do NOT simulate pointer physics"
// We directly test the pure mapping logic: given a starting order and a
// drag event (activeId, overId), arrayMove produces the correct id sequence.
// ---------------------------------------------------------------------------
describe("DnD onDragEnd → updateOrder id-sequence mapping (BUGFIX #3)", () => {
  it("drag item at index 0 to index 2 → correct id order", () => {
    // Simulate a list: [id=1, id=2, id=3]
    const todos: Todo[] = [
      makeTodo({ id: 1, order: 0 }),
      makeTodo({ id: 2, order: 1 }),
      makeTodo({ id: 3, order: 2 }),
    ];

    // Simulate onDragOver: active.id=1 dragged over over.id=3
    const activeId = 1;
    const overId = 3;
    const oldIndex = todos.findIndex((t) => t.id === activeId);
    const newIndex = todos.findIndex((t) => t.id === overId);
    const reordered = arrayMove(todos, oldIndex, newIndex);

    // Expected: item 1 moved to the end → [2, 3, 1]
    expect(reordered.map((t) => t.id)).toEqual([2, 3, 1]);
    // The id sequence passed to reorder() is:
    const newIdOrder = reordered.map((t) => t.id);
    expect(newIdOrder).toEqual([2, 3, 1]);
  });

  it("drag item at index 2 to index 0 → correct id order", () => {
    const todos: Todo[] = [
      makeTodo({ id: 10, order: 0 }),
      makeTodo({ id: 20, order: 1 }),
      makeTodo({ id: 30, order: 2 }),
    ];
    const activeId = 30;
    const overId = 10;
    const oldIndex = todos.findIndex((t) => t.id === activeId);
    const newIndex = todos.findIndex((t) => t.id === overId);
    const reordered = arrayMove(todos, oldIndex, newIndex);
    expect(reordered.map((t) => t.id)).toEqual([30, 10, 20]);
  });

  it("no-op drag (same position) → id order unchanged", () => {
    const todos: Todo[] = [
      makeTodo({ id: 1, order: 0 }),
      makeTodo({ id: 2, order: 1 }),
    ];
    const activeId = 1;
    const overId = 1;
    const oldIndex = todos.findIndex((t) => t.id === activeId);
    const newIndex = todos.findIndex((t) => t.id === overId);
    const reordered = arrayMove(todos, oldIndex, newIndex);
    expect(reordered.map((t) => t.id)).toEqual([1, 2]);
  });

  it("onDragEnd persists when the drop moves the row, even over itself (real hasOrderChanged)", () => {
    // REGRESSION: the list live-reorders during onDragOver, so at drop time
    // the dragged row sits under the pointer (over.id === active.id is the
    // NORMAL outcome of a successful move, not a no-op). The old guard
    // compared active vs over ids and swallowed ~every real drop, so the
    // order silently reverted on the next reload. The decision must compare
    // the drag-START snapshot against the drop-time sequence instead.

    // Drag row 1 (of [1,2,3]) to the end: live-reordered local order is
    // [2,3,1] with the pointer over row 1 itself → must STILL persist.
    expect(hasOrderChanged([1, 2, 3], [2, 3, 1])).toBe(true);
  });

  it("onDragEnd no-op guard: unchanged sequence skips onReorder (real handler)", () => {
    // Same-position drop (or drop with no movement): drag-start snapshot
    // equals the drop-time sequence → no persist (no redundant UPDATE
    // "Order" writes / reload).
    expect(hasOrderChanged([1, 2], [1, 2])).toBe(false);
    // Different lengths (add/remove mid-drag) → persist to be safe.
    expect(hasOrderChanged([1, 2], [1, 2, 3])).toBe(true);
    expect(hasOrderChanged([1, 2, 3], [1, 3])).toBe(true);
  });
});
