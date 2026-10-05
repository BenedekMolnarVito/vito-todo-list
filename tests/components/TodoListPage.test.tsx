/**
 * TodoListPage component tests.
 *
 * Acceptance:
 * - Renders the list of todos with correct data-testids.
 * - Renders the add button with data-testid='add-button'.
 * - Shows each todo row with data-testid='todo-row-<id>'.
 * - Shows each delete button with data-testid='delete-<id>'.
 * - Shows each checkbox with data-testid='checkbox-<id>'.
 * - Shows loading state.
 *
 * Tests import vitest explicitly (globals: false).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TodoListPage } from "../../src/components/TodoListPage.js";
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

function renderListPage(todos: Todo[], loading = false): void {
  render(
    <MemoryRouter>
      <TodoListPage
        todos={todos}
        loading={loading}
        onToggleComplete={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
        onExportJson={vi.fn(() => "[]")}
        onShareExport={vi.fn()}
        onImportJson={vi.fn()}
      />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("TodoListPage", () => {
  it("renders the page with data-testid='todo-list-page'", () => {
    renderListPage([]);
    expect(screen.getByTestId("todo-list-page")).toBeDefined();
  });

  it("renders the add button with data-testid='add-button'", () => {
    renderListPage([]);
    expect(screen.getByTestId("add-button")).toBeDefined();
  });

  it("shows loading message when loading=true", () => {
    renderListPage([], true);
    expect(screen.getByText(/loading/i)).toBeDefined();
  });

  it("renders todo rows with data-testid='todo-row-<id>'", () => {
    const todos = [
      makeTodo({ id: 1, title: "First" }),
      makeTodo({ id: 2, title: "Second" }),
    ];
    renderListPage(todos);
    expect(screen.getByTestId("todo-row-1")).toBeDefined();
    expect(screen.getByTestId("todo-row-2")).toBeDefined();
  });

  it("renders checkboxes with data-testid='checkbox-<id>'", () => {
    const todos = [makeTodo({ id: 10 }), makeTodo({ id: 20 })];
    renderListPage(todos);
    expect(screen.getByTestId("checkbox-10")).toBeDefined();
    expect(screen.getByTestId("checkbox-20")).toBeDefined();
  });

  it("renders delete buttons with data-testid='delete-<id>'", () => {
    const todos = [makeTodo({ id: 5 }), makeTodo({ id: 6 })];
    renderListPage(todos);
    expect(screen.getByTestId("delete-5")).toBeDefined();
    expect(screen.getByTestId("delete-6")).toBeDefined();
  });

  it("renders drag handles with data-testid='drag-handle-<id>'", () => {
    const todos = [makeTodo({ id: 99 })];
    renderListPage(todos);
    expect(screen.getByTestId("drag-handle-99")).toBeDefined();
  });

  it("does not show loading message when loading=false", () => {
    renderListPage([makeTodo({ id: 1 })]);
    expect(screen.queryByText(/loading/i)).toBeNull();
  });

  it("renders the todo-list container", () => {
    renderListPage([makeTodo({ id: 1, title: "Hello" })]);
    expect(screen.getByTestId("todo-list")).toBeDefined();
  });

  it("displays the todo title text in the row", () => {
    const todos = [makeTodo({ id: 1, title: "Buy groceries" })];
    renderListPage(todos);
    expect(screen.getByText("Buy groceries")).toBeDefined();
  });

  it("renders completed todo with strikethrough style", () => {
    const todos = [makeTodo({ id: 3, title: "Done task", isCompleted: true })];
    renderListPage(todos);
    const row = screen.getByTestId("todo-row-3");
    const titleEl = row.querySelector("span") as HTMLElement;
    expect(titleEl.style.textDecoration).toBe("line-through");
  });

  it("renders deadline label when deadline is set", () => {
    const todos = [
      makeTodo({ id: 4, title: "With deadline", deadline: "2026-12-25T10:30:00" }),
    ];
    renderListPage(todos);
    expect(screen.getByText(/Due: Dec 25/)).toBeDefined();
  });
});
