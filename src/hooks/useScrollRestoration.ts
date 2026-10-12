/**
 * useScrollRestoration — preserve window scroll position across route swaps.
 *
 * App.tsx mounts the list and edit routes as SIBLINGS, so TodoListPage fully
 * unmounts when navigating to /edit/:id or /add and remounts on navigate(-1).
 * The remounted page renders at the top of the window (the scroll container is
 * window/document — TodoListPage has no overflow container), so the user loses
 * their position in a long list.
 *
 * Design (rework-brief, keep exactly):
 * - module-scoped `savedScrollY`, NOT sessionStorage: a route swap never
 *   reloads the page, so a module var survives it; a cold start (fresh JS
 *   context) must begin at top, not at a stale offset.
 * - Save has TWO paths:
 *   a. PRIMARY — gesture-time capture. `captureScrollY()` is called from the
 *      row-edit and add-button handlers BEFORE `navigate(...)`. This reads
 *      window.scrollY while the long list page is still laid out, so there is
 *      zero timing race with the route swap.
 *   b. FALLBACK — save in a `useLayoutEffect` cleanup (NOT a passive
 *      useEffect). The old passive-effect cleanup could flush AFTER the
 *      browser's rendering steps, by which time the short editor page had
 *      committed and the browser had clamped window.scrollY to the editor's
 *      max scroll (observed on-device: saved 16 instead of 800). Layout-effect
 *      cleanups run synchronously in the commit mutation phase, BEFORE the
 *      rendering steps where clamping happens, so the fallback still sees the
 *      pre-swap value. Covers any unmount path that isn't one of the two
 *      gestures.
 * - PRECEDENCE (critical): the fallback must NOT overwrite a fresher gesture
 *   capture. `captureScrollY()` sets `savedScrollY` + `gestureCaptured = true`;
 *   the cleanup saves window.scrollY only when `gestureCaptured` is false,
 *   and resets the flag to false either way — so after a gesture-captured
 *   navigation, a later unmount without a gesture capture saves normally
 *   again.
 * - Restore: once per mount, gated on `ready` (rows actually rendered, not
 *   just loading=false), inside requestAnimationFrame so the browser has laid
 *   out the rows before scrolling. A useRef flag makes it once-per-mount and is
 *   deliberately NEVER cleared in any cleanup — it must survive React 18
 *   StrictMode's simulated unmount (dev double-mount must not double-scroll
 *   or consume the saved value).
 *
 * Compatibility note: restoring the CORRECT offset agrees with Chrome's native
 * same-document scroll restoration on navigate(-1) (same target value), so the
 * two do not fight — the rAF restore only matters where native restoration is
 * not dependable (rows not yet rendered at restoration time / short document).
 */
import { useLayoutEffect, useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Module-scoped state — shared between the unmounting and remounting
// TodoListPage instances within one JS context. null = nothing saved yet
// (cold start → stay at top, never call scrollTo).
// ---------------------------------------------------------------------------
let savedScrollY: number | null = null;
// True when the pending savedScrollY came from a gesture-time captureScrollY()
// call and therefore must not be overwritten by the layout-cleanup fallback.
let gestureCaptured = false;

/**
 * Capture the current window scroll offset NOW, before any route swap can
 * clamp it. Call BEFORE `navigate(...)` in the row-edit and add handlers.
 * Sets the gestureCaptured precedence flag so the unmount fallback keeps this
 * fresher value instead of re-reading (possibly already clamped) scrollY.
 */
export function captureScrollY(): void {
  savedScrollY = window.scrollY;
  gestureCaptured = true;
}

/**
 * Save the window scroll offset on unmount and restore it once, after the
 * rows are on screen.
 *
 * @param ready - rows are rendered (list loaded AND non-empty). Restore is
 *                gated on this so the scroll target actually exists; calling
 *                scrollTo while the page is at its short "Loading…" height
 *                would clamp to the top.
 */
export function useScrollRestoration(ready: boolean): void {
  // Once-per-mount latch. Never cleared: StrictMode's simulated unmount on the
  // SAME component instance must not reopen a second restore (double-scroll).
  const restoredRef = useRef<boolean>(false);

  // FALLBACK save: layout-effect cleanup runs synchronously in the commit
  // mutation phase — before the browser's rendering steps where the short
  // editor page would clamp window.scrollY. Skipped when a gesture-time
  // captureScrollY() already stored a fresher value (precedence); the flag is
  // reset either way so later gesture-less unmounts save normally again.
  useLayoutEffect(() => {
    return () => {
      if (gestureCaptured) {
        gestureCaptured = false;
        return;
      }
      savedScrollY = window.scrollY;
    };
  }, []);

  // Restore once after rows have laid out.
  useEffect(() => {
    if (!ready || restoredRef.current || savedScrollY === null) return;
    restoredRef.current = true;
    // Capture now: `savedScrollY` is a mutable module `let`, so TypeScript
    // will not narrow its null check inside the rAF closure — and capturing
    // also pins the value against any later overwrite before the frame runs.
    const y = savedScrollY;
    const raf = requestAnimationFrame(() => {
      window.scrollTo(0, y);
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [ready]);
}

/**
 * @internal TEST-ONLY: clear the module-scoped saved offset (and the
 * gesture-capture flag) so each vitest case starts from the cold state
 * module state by design (the brief rejects sessionStorage), and vitest keeps
 * the module registry alive between tests in a file — without a reset hook,
 * cases would leak saved offsets into each other. Never call from app code.
 */
export function __resetScrollRestorationForTests(): void {
  savedScrollY = null;
  gestureCaptured = false;
}
