/**
 * TodoEditPage component tests.
 *
 * Acceptance:
 * - Renders title/description/deadline-date/deadline-time inputs with data-testids.
 * - Renders save/cancel buttons with data-testids.
 * - Save triggers form validation.
 * - Cancel navigates back.
 *
 * Uses React Router v6 MemoryRouter for navigation testing.
 * Tests import vitest explicitly (globals: false).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { createNodeExecutor } from "../helpers/nodeExecutor.js";
import { initDatabase } from "../../src/data/DatabaseService.js";
import { TodoEditPage } from "../../src/components/TodoEditPage.js";
import type { SqliteExecutor } from "../../src/data/SqliteExecutor.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
let exec: SqliteExecutor;
let close: () => void;

beforeEach(async () => {
  ({ exec, close } = createNodeExecutor());
  await initDatabase(exec);
});

afterEach(() => {
  close();
  cleanup();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderEditPage(path = "/add", initialPath = "/add"): void {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/add" element={<TodoEditPage exec={exec} />} />
        <Route path="/edit/:id" element={<TodoEditPage exec={exec} />} />
      </Routes>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("TodoEditPage", () => {
  it("renders the title input with data-testid='title-input'", () => {
    renderEditPage();
    expect(screen.getByTestId("title-input")).toBeDefined();
  });

  it("renders the description input with data-testid='description-input'", () => {
    renderEditPage();
    expect(screen.getByTestId("description-input")).toBeDefined();
  });

  it("renders save button with data-testid='save-button'", () => {
    renderEditPage();
    expect(screen.getByTestId("save-button")).toBeDefined();
  });

  it("renders cancel button with data-testid='cancel-button'", () => {
    renderEditPage();
    expect(screen.getByTestId("cancel-button")).toBeDefined();
  });

  it("does not render deadline inputs when deadline toggle is off", () => {
    renderEditPage();
    expect(screen.queryByTestId("deadline-date-input")).toBeNull();
    expect(screen.queryByTestId("deadline-time-input")).toBeNull();
  });

  it("shows deadline date + time inputs when deadline toggle is checked", async () => {
    renderEditPage();
    const toggle = screen.getByRole("checkbox", { name: /set deadline/i });
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(screen.getByTestId("deadline-date-input")).toBeDefined();
    expect(screen.getByTestId("deadline-time-input")).toBeDefined();
  });

  it("shows validation error when save is clicked with empty title", async () => {
    renderEditPage();
    const saveBtn = screen.getByTestId("save-button");
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    // Error message should appear
    expect(screen.getByText(/title is required/i)).toBeDefined();
  });

  it("save succeeds with a valid title (no error shown)", async () => {
    renderEditPage();
    const titleInput = screen.getByTestId("title-input");
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: "My new todo" } });
    });
    const saveBtn = screen.getByTestId("save-button");
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    // No validation error shown
    expect(screen.queryByText(/title is required/i)).toBeNull();
  });

  it("renders 'Add Todo' heading on /add route", () => {
    renderEditPage("/add", "/add");
    expect(screen.getByText("Add Todo")).toBeDefined();
  });

  it("renders the page with data-testid='todo-edit-page'", () => {
    renderEditPage();
    expect(screen.getByTestId("todo-edit-page")).toBeDefined();
  });
});
