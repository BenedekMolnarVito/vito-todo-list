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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { TodoListPage } from "../../src/components/TodoListPage.js";
import { __resetScrollRestorationForTests } from "../../src/hooks/useScrollRestoration.js";
import { App as CapAppMock } from "../../src/__mocks__/@capacitor/app.js";
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

function renderListPage(todos: Todo[], loading = false) {
  return render(
    <MemoryRouter>
      <TodoListPage
        todos={todos}
        loading={loading}
        onToggleComplete={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
        onExportAndShare={vi.fn()}
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

  it("does not render the app name in the header", () => {
    renderListPage([]);
    expect(screen.queryByText("VitoTodoList")).toBeNull();
  });

  it("places the add button on the left of the header (left-handed layout)", () => {
      renderListPage([]);
      const addButton = screen.getByTestId("add-button");
      const header = addButton.parentElement as HTMLElement;
      expect(header.firstElementChild).toBe(addButton);
      expect(header.style.justifyContent).toBe("space-between");
    });

    it("renders Export and Import buttons in the header (right-aligned)", () => {
        renderListPage([]);
        const exportButton = screen.getByText("Export");
        const importButton = screen.getByText("Import");
        const header = exportButton.closest('[style*="space-between"]');
        expect(header).toBeDefined();
        // Verify they are in the right-aligned container (Export first, Import second, file input is last but hidden)
        const rightContainer = exportButton.parentElement;
        expect(rightContainer).toBeDefined();
        expect(rightContainer?.firstElementChild).toBe(exportButton);
        // Import is second child (file input is last but hidden via display: none)
        expect(rightContainer?.children[1]).toBe(importButton);
      });

    it("does not render a Share button", () => {
      renderListPage([]);
      expect(screen.queryByText("Share")).toBeNull();
    });

    it("does not render the toolbar", () => {
      renderListPage([]);
      // The old toolbar had backgroundColor YELLOW_MEDIUM and contained the buttons
      // Now YELLOW_MEDIUM is only used in the headerRightStyle (right container)
      const yellowMediumElements = document.querySelectorAll('[style*="rgb(255, 241, 118)"]');
      // Should only have the header right container, not a separate toolbar
      expect(yellowMediumElements.length).toBeLessThanOrEqual(1);
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
    const titleEl = row.querySelector('[data-testid="todo-title-3"]') as HTMLElement;
    expect(titleEl.style.textDecoration).toBe("line-through");
  });

  it("renders deadline label when deadline is set", () => {
    const todos = [
      makeTodo({ id: 4, title: "With deadline", deadline: "2026-12-25T10:30:00" }),
    ];
    renderListPage(todos);
    expect(screen.getByText(/Due: Dec 25/)).toBeDefined();
  });

  it("hardware back on the main list exits the app", async () => {
    // Capture the backButton callback the page registers, then fire it:
    // the app must exit (not walk WebView history / do nothing).
    const backCallbacks: Array<(...args: unknown[]) => void> = [];
    const addSpy = vi
      .spyOn(CapAppMock, "addListener")
      .mockImplementation(async (_event: string, cb: (...args: unknown[]) => void) => {
        backCallbacks.push(cb);
        return { remove: () => undefined };
      });
    const exitSpy = vi.spyOn(CapAppMock, "exitApp").mockResolvedValue(undefined);

    try {
      renderListPage([]);
      // Wait for the effect's dynamic import + addListener (no fixed sleep —
      // waitFor polls, so this stays robust under CI load).
      await waitFor(() => {
        expect(addSpy).toHaveBeenCalledWith("backButton", expect.any(Function));
      });
      expect(backCallbacks).toHaveLength(1);

      await act(async () => {
        backCallbacks[0]?.();
      });
      expect(exitSpy).toHaveBeenCalledTimes(1);
    } finally {
      addSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("removes the backButton listener on unmount", async () => {
    const removeFn = vi.fn();
    const addSpy = vi
      .spyOn(CapAppMock, "addListener")
      .mockResolvedValue({ remove: removeFn });

    try {
      const { unmount } = renderListPage([]);
      await waitFor(() => {
        expect(addSpy).toHaveBeenCalledWith("backButton", expect.any(Function));
      });
      unmount();
      expect(removeFn).toHaveBeenCalledTimes(1);
    } finally {
      addSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Scroll restoration (keep list scroll position when returning from edit/add)
//
// jsdom quirks: window.scrollTo is NOT implemented → spy-stub it; window
// .scrollY is a read-only getter → override via Object.defineProperty; the
// restore is scheduled in requestAnimationFrame → flush a frame inside act().
// ---------------------------------------------------------------------------
function setScrollY(y: number): void {
  Object.defineProperty(window, "scrollY", {
    value: y,
    configurable: true,
    writable: true,
  });
}

async function flushFrame(): Promise<void> {
  await act(async () => {
    await new Promise<null>((resolve) => {
      requestAnimationFrame(() => resolve(null));
    });
  });
}

function listProps(todos: Todo[], loading: boolean) {
  return {
    todos,
    loading,
    onToggleComplete: vi.fn(),
    onRemove: vi.fn(),
    onReorder: vi.fn(),
    onExportAndShare: vi.fn(),
    onImportJson: vi.fn(),
  };
}

describe("TodoListPage scroll restoration", () => {
  let scrollToSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetScrollRestorationForTests();
    setScrollY(0);
    scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Save `y` by mounting the loaded list at that offset and unmounting it —
   * the exact path navigation to /edit/:id or /add takes. */
  function seedSaved(y: number): void {
    setScrollY(y);
    const { unmount } = render(
      <MemoryRouter>
        <TodoListPage {...listProps([makeTodo({ id: 1 })], false)} />
      </MemoryRouter>
    );
    unmount();
    scrollToSpy.mockClear();
  }

  it("saves scrollY on unmount and restores it once on remount with rows loaded", async () => {
    seedSaved(600);
    setScrollY(0);

    render(
      <MemoryRouter>
        <TodoListPage
          {...listProps([makeTodo({ id: 1, title: "A" }), makeTodo({ id: 2, title: "B" })], false)}
        />
      </MemoryRouter>
    );
    await flushFrame();

    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 600);
  });

  it("does not restore while loading=true; restores exactly once when rows render", async () => {
    seedSaved(600);
    setScrollY(0);
    const todos = [makeTodo({ id: 1, title: "A" })];

    const { rerender } = render(
      <MemoryRouter>
        <TodoListPage {...listProps(todos, true)} />
      </MemoryRouter>
    );
    await flushFrame();
    expect(scrollToSpy).not.toHaveBeenCalled();

    // Async load completes → loading=false with rows present.
    rerender(
      <MemoryRouter>
        <TodoListPage {...listProps(todos, false)} />
      </MemoryRouter>
    );
    await flushFrame();
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 600);
  });

  it("fresh mount with no saved value never calls scrollTo (cold start stays at top)", async () => {
    setScrollY(600); // window happens to be scrolled, but nothing was saved

    render(
      <MemoryRouter>
        <TodoListPage {...listProps([makeTodo({ id: 1 })], false)} />
      </MemoryRouter>
    );
    await flushFrame();

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it("idempotent: re-renders with changed todos after a restore do not snap back", async () => {
    seedSaved(600);
    setScrollY(0);

    const { rerender } = render(
      <MemoryRouter>
        <TodoListPage {...listProps([makeTodo({ id: 1 }), makeTodo({ id: 2 })], false)} />
      </MemoryRouter>
    );
    await flushFrame();
    expect(scrollToSpy).toHaveBeenCalledTimes(1);

    // User scrolls on, then a delete arrives (new todos array) after a brief
    // loading flip — ready true→false→true. Must NOT re-scroll to 600.
    setScrollY(120);
    rerender(
      <MemoryRouter>
        <TodoListPage {...listProps([makeTodo({ id: 1 })], true)} />
      </MemoryRouter>
    );
    rerender(
      <MemoryRouter>
        <TodoListPage {...listProps([makeTodo({ id: 1 })], false)} />
      </MemoryRouter>
    );
    await flushFrame();
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
  });

  it("restores after a full /add → navigate(-1) round trip through the router", async () => {
    // Mirrors App.tsx's sibling Routes: navigating away UNMOUNTS the list.
    function AddStub(): JSX.Element {
      const navigate = useNavigate();
      return (
        <button data-testid="add-stub-back" onClick={() => navigate(-1)}>
          back
        </button>
      );
    }

    setScrollY(600);
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={<TodoListPage {...listProps([makeTodo({ id: 1 })], false)} />}
          />
          <Route path="/add" element={<AddStub />} />
        </Routes>
      </MemoryRouter>
    );
    await flushFrame();
    expect(scrollToSpy).not.toHaveBeenCalled(); // cold start — nothing saved

    // Tap + → navigate("/add") → list unmounts → scrollY saved.
    fireEvent.click(screen.getByTestId("add-button"));
    setScrollY(0); // "on the add page" the window is at the top

    // Hardware back / cancel from the add page → navigate(-1) → list remounts.
    fireEvent.click(screen.getByTestId("add-stub-back"));
    await flushFrame();

    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 600);
  });

  it("restores after a full row-tap /edit/:id → navigate(-1) round trip through the router", async () => {
    function EditStub({ id }: { id: string }): JSX.Element {
      const navigate = useNavigate();
      return (
        <button data-testid="edit-stub-back" onClick={() => navigate(-1)}>
          edit {id}
        </button>
      );
    }

    setScrollY(450);
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={<TodoListPage {...listProps([makeTodo({ id: 7, title: "Tap me" })], false)} />}
          />
          <Route path="/edit/:id" element={<EditStub id="x" />} />
        </Routes>
      </MemoryRouter>
    );
    await flushFrame();
    expect(scrollToSpy).not.toHaveBeenCalled();

    // Tap the row → navigate("/edit/7") → list unmounts → scrollY saved.
    fireEvent.click(screen.getByTestId("todo-row-7"));
    setScrollY(0);

    // Save on the edit page → navigate(-1) → list remounts with rows.
    fireEvent.click(screen.getByTestId("edit-stub-back"));
    await flushFrame();

    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 450);
  });

  it("gesture capture survives a clamped editor offset on the /add round trip", async () => {
    // Wired-path check for handleAddClick → captureScrollY() BEFORE
    // navigate("/add"): the + tap captures 800, the short editor page then
    // clamps the live offset to 16 (the on-device failure value), and the
    // return trip must still restore 800 — not 16.
    // NOTE: jsdom has no layout/clamping, so the clamp is applied manually
    // here; the layout-vs-passive timing itself is only gated on-device
    // (S6a/S6b).
    function AddStub(): JSX.Element {
      const navigate = useNavigate();
      return (
        <button data-testid="add-stub-back" onClick={() => navigate(-1)}>
          back
        </button>
      );
    }

    setScrollY(800);
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={<TodoListPage {...listProps([makeTodo({ id: 1 })], false)} />}
          />
          <Route path="/add" element={<AddStub />} />
        </Routes>
      </MemoryRouter>
    );
    await flushFrame();
    expect(scrollToSpy).not.toHaveBeenCalled(); // cold start — nothing saved

    // Tap + → captureScrollY(800) → navigate("/add") → list unmounts.
    fireEvent.click(screen.getByTestId("add-button"));
    // "On the add page" the short document clamps the live window offset.
    setScrollY(16);

    // Back from the add page → navigate(-1) → list remounts with rows.
    fireEvent.click(screen.getByTestId("add-stub-back"));
    await flushFrame();

    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 800);
  });
});
