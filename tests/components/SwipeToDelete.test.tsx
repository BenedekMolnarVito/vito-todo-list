/**
 * SwipeToDelete component tests.
 *
 * CHANGE #4 acceptance:
 * - The delete action is on the LEFT (leadingActions / data-swipe-side="leading").
 * - NOT on the right (trailing).
 * - The delete button has the correct data-testid="delete-<id>".
 * - Clicking the delete button (revealed state) triggers the confirm dialog
 *   and calls onDelete on confirm.
 * - The swipe container has data-testid="swipe-container-<id>".
 *
 * Per plan §5.4 + android-webview-jev-testing skill: do NOT rely on synthetic
 * swipe in tests — assert the leading-action config and drive delete via its
 * click handler directly.
 *
 * Tests import vitest explicitly (globals: false).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SwipeToDelete } from "../../src/components/SwipeToDelete.js";

// Cleanup DOM after each test (globals:false — auto-cleanup won't fire)
afterEach(cleanup);

// ---------------------------------------------------------------------------
// Mock window.confirm (jsdom does not pop real dialogs)
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("SwipeToDelete — CHANGE #4: left-anchored delete", () => {
  it("renders the swipe container with correct data-testid", () => {
    render(
      <SwipeToDelete todoId={5} todoTitle="My Task" onDelete={vi.fn()}>
        <div>Row content</div>
      </SwipeToDelete>
    );
    expect(screen.getByTestId("swipe-container-5")).toBeDefined();
  });

  it("delete button has data-testid=delete-<id>", () => {
    render(
      <SwipeToDelete todoId={42} todoTitle="Todo 42" onDelete={vi.fn()}>
        <div>Row</div>
      </SwipeToDelete>
    );
    expect(screen.getByTestId("delete-42")).toBeDefined();
  });

  it("delete button is on the LEFT (data-swipe-side='leading') — CHANGE #4", () => {
    render(
      <SwipeToDelete todoId={1} todoTitle="Task A" onDelete={vi.fn()}>
        <div>Row</div>
      </SwipeToDelete>
    );
    const deleteBtn = screen.getByTestId("delete-1");
    // Assert it carries the leading (left) marker — not trailing
    expect(deleteBtn.getAttribute("data-swipe-side")).toBe("leading");
    expect(deleteBtn.getAttribute("data-swipe-side")).not.toBe("trailing");
  });

  it("delete button is NOT on the right (no data-swipe-side='trailing')", () => {
    render(
      <SwipeToDelete todoId={2} todoTitle="Task B" onDelete={vi.fn()}>
        <div>Row</div>
      </SwipeToDelete>
    );
    // Ensure there is no element marked as trailing
    const trailingEls = document.querySelectorAll('[data-swipe-side="trailing"]');
    expect(trailingEls.length).toBe(0);
  });

  it("clicking delete button shows confirm dialog and calls onDelete on confirm", () => {
    const onDelete = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <SwipeToDelete todoId={3} todoTitle="Buy milk" onDelete={onDelete}>
        <div>Row</div>
      </SwipeToDelete>
    );

    const deleteBtn = screen.getByTestId("delete-3");
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalledWith("Delete 'Buy milk'?");
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("clicking delete button with confirm=false does NOT call onDelete", () => {
    const onDelete = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <SwipeToDelete todoId={4} todoTitle="Walk dog" onDelete={onDelete}>
        <div>Row</div>
      </SwipeToDelete>
    );

    const deleteBtn = screen.getByTestId("delete-4");
    fireEvent.click(deleteBtn);

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("children (row content) are rendered inside the swipe container", () => {
    render(
      <SwipeToDelete todoId={6} todoTitle="Task" onDelete={vi.fn()}>
        <div data-testid="inner-row">Row content here</div>
      </SwipeToDelete>
    );
    expect(screen.getByTestId("inner-row")).toBeDefined();
    expect(screen.getByText("Row content here")).toBeDefined();
  });

  it("delete button is positioned on the left side (position absolute, left: 0)", () => {
    render(
      <SwipeToDelete todoId={7} todoTitle="Task C" onDelete={vi.fn()}>
        <div>Row</div>
      </SwipeToDelete>
    );
    const deleteBtn = screen.getByTestId("delete-7") as HTMLElement;
    expect(deleteBtn.style.left).toBe("0px");
    // Confirm it's not anchored to the right
    expect(deleteBtn.style.right).toBe("");
  });
});
