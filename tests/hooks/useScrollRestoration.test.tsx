/**
 * useScrollRestoration hook tests.
 *
 * Acceptance (impl-brief):
 * - save window.scrollY on unmount, restore once on the next mount when ready.
 * - restore gated on `ready` (rows rendered), not merely mounted.
 * - cold start (no saved value) → scrollTo never called.
 * - once-per-mount: re-renders after the restore (incl. ready flipping false
 *   again, e.g. a delete-triggered reload) must NOT snap back.
 * - pending rAF cancelled on unmount.
 * - StrictMode dev double-mount: no double-scroll, value not consumed.
 *
 * jsdom quirks (per brief): window.scrollTo is NOT implemented → spy-stub it;
 * window.scrollY is a read-only getter → override via Object.defineProperty.
 * The restore runs inside requestAnimationFrame → flush a frame in act().
 *
 * Tests import vitest explicitly (globals: false).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode } from "react";
import { render, cleanup, act, type RenderResult } from "@testing-library/react";
import {
  useScrollRestoration,
  captureScrollY,
  __resetScrollRestorationForTests,
} from "../../src/hooks/useScrollRestoration.js";

// Cleanup DOM after each test (globals:false — auto-cleanup won't fire)
afterEach(cleanup);

// Belt-and-braces: if this jsdom build lacks the animation-frame clock, fall
// back to a timeout-driven polyfill so the hook (and flushFrame below) still
// exercise real scheduling.
if (typeof window.requestAnimationFrame !== "function") {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number =>
    setTimeout(() => cb(performance.now()), 0) as unknown as number
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
    clearTimeout(id);
  });
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** Minimal component that just consumes the hook. */
function Probe({ ready }: { ready: boolean }): null {
  useScrollRestoration(ready);
  return null;
}

function setScrollY(y: number): void {
  Object.defineProperty(window, "scrollY", {
    value: y,
    configurable: true,
    writable: true,
  });
}

/** Await one animation frame (the hook's restore lands in the frame queued
 *  before this one, FIFO) — inside act() so React state settles too. */
async function flushFrame(): Promise<void> {
  await act(async () => {
    await new Promise<null>((resolve) => {
      requestAnimationFrame(() => resolve(null));
    });
  });
}

let scrollToSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  __resetScrollRestorationForTests();
  setScrollY(0);
  scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Save `y` by mounting an unready probe (no restore possible) at that offset
 *  and unmounting it — the hook's save-on-unmount path. */
function seedSaved(y: number): void {
  setScrollY(y);
  const { unmount } = render(<Probe ready={false} />);
  unmount();
  scrollToSpy.mockClear();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("useScrollRestoration", () => {
  it("saves scrollY on unmount and restores it once after ready on remount", async () => {
    seedSaved(600);
    setScrollY(0); // remounted page starts at the top

    render(<Probe ready={true} />);
    await flushFrame();

    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 600);
  });

  it("does not restore while not ready; restores exactly once when ready flips true", async () => {
    seedSaved(600);
    setScrollY(0);

    const { rerender } = render(<Probe ready={false} />);
    await flushFrame();
    expect(scrollToSpy).not.toHaveBeenCalled();

    rerender(<Probe ready={true} />);
    await flushFrame();
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 600);
  });

  it("cold start (nothing saved yet) never calls scrollTo", async () => {
    setScrollY(600); // window happens to be scrolled…

    render(<Probe ready={true} />);
    await flushFrame();

    // …but no previous mount saved it → the list stays at the top.
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it("restores once per mount: later renders (ready flipping again after a reload) do not snap back", async () => {
    seedSaved(600);
    setScrollY(0);

    const { rerender } = render(<Probe ready={true} />);
    await flushFrame();
    expect(scrollToSpy).toHaveBeenCalledTimes(1);

    // Simulate the post-restore churn: user scrolls on, a delete triggers a
    // reload (ready false→true) and plain re-renders arrive.
    setScrollY(120);
    rerender(<Probe ready={false} />);
    rerender(<Probe ready={true} />);
    rerender(<Probe ready={true} />);
    await flushFrame();

    expect(scrollToSpy).toHaveBeenCalledTimes(1);
  });

  it("cancels the pending restore when unmounted before the frame fires", async () => {
    seedSaved(600);
    setScrollY(0);

    const { unmount }: RenderResult = render(<Probe ready={true} />);
    unmount(); // before flushFrame → cleanup must cancelAnimationFrame
    await flushFrame();

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it("StrictMode dev double-mount does not double-scroll and does not consume the saved value", async () => {
    seedSaved(600);
    // Keep the live offset equal to the saved one while the StrictMode tree is
    // mounted: its simulated-unmount save-cleanup must not overwrite the
    // pending value with a different number (jsdom window.scrollY otherwise
    // reads 0).
    setScrollY(600);

    const tree = render(
      <StrictMode>
        <Probe ready={true} />
      </StrictMode>
    );
    await flushFrame();
    const callsAfterDoubleMount = scrollToSpy.mock.calls.length;
    // Never more than one scrollTo from the double-mount itself.
    expect(callsAfterDoubleMount).toBeLessThanOrEqual(1);

    // Real unmount (saves 600 again) → plain remount must still restore: the
    // StrictMode pass did not consume the value.
    tree.unmount();
    setScrollY(0);
    render(<Probe ready={true} />);
    await flushFrame();

    expect(scrollToSpy.mock.calls.length).toBe(callsAfterDoubleMount + 1);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 600);
  });

  it("gesture-capture precedence (on-device regression mirror): capture at 800 survives the clamp to 16", async () => {
    // jsdom cannot model layout-vs-passive timing (no layout, no clamping),
    // so simulate the on-device sequence explicitly: gesture-time capture at
    // the true offset, THEN the editor page clamps window.scrollY to 16,
    // THEN the list unmounts. The fallback cleanup must not overwrite 800.
    setScrollY(800);
    const { unmount } = render(<Probe ready={false} />);
    captureScrollY(); // row-tap / +-button handler runs BEFORE navigate()
    setScrollY(16); // short editor page clamps the live offset
    unmount();
    scrollToSpy.mockClear();

    setScrollY(0); // remounted page starts at the top
    render(<Probe ready={true} />);
    await flushFrame();

    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 800);
  });

  it("fallback path: unmount WITHOUT a gesture capture saves window.scrollY", async () => {
    // No captureScrollY() call — the layout-cleanup fallback saves the live
    // offset (covers unmount paths that aren't the two gestures).
    setScrollY(350);
    const { unmount } = render(<Probe ready={false} />);
    unmount();
    scrollToSpy.mockClear();

    setScrollY(0);
    render(<Probe ready={true} />);
    await flushFrame();

    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 350);
  });

  it("flag reset: after a gesture-captured navigation, a later unmount without capture saves normally again", async () => {
    // First navigation: gesture capture at 800 survives the clamp + unmount.
    setScrollY(800);
    const first = render(<Probe ready={false} />);
    captureScrollY();
    setScrollY(16);
    first.unmount();

    // Remount restores the gesture-captured 800.
    setScrollY(0);
    const second = render(<Probe ready={true} />);
    await flushFrame();
    expect(scrollToSpy).toHaveBeenCalledWith(0, 800);

    // A later unmount WITHOUT a gesture capture must save the live offset
    // again — the precedence flag was reset by the first unmount.
    setScrollY(200);
    second.unmount();
    scrollToSpy.mockClear();

    setScrollY(0);
    render(<Probe ready={true} />);
    await flushFrame();

    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 200);
  });
});
