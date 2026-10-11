# Handoff 2: drag-reorder not persisted — root cause narrowed, ONE experiment missing

Repo: C:\Users\molna\VSCodeRepos\vito-todo-list
Branch: feat/bugfix/remove-share-move-export-import (do not commit/push without consent)
Supersedes: handoff-reorder-widget-sync.md (same scratch dir)

## USER DIRECTIVE (2026-10-09, authoritative)

"Lose the UI smoke test. Verify only unit tests and the reordering bugfix."
→ No more emulator/UI-smoke runs. Fix the reorder persistence bug; gates are
`npx tsc --noEmit`, `npm run build`, `npm run test` (vitest). Windows host.

## Bug (user report)

Add todo → drag-reorder → exit app → widget shows OLD order; reopening the app
also shows the old order. I.e. the reorder UPDATEs never reach the DB file.

## Established facts (all EMPIRICAL, emulator run today; APK built 12:39 today)

F1. Native chain v8.1.1: CapacitorSQLitePlugin.run (CapacitorSQLitePlugin.java:1029)
    → CapacitorSQLite.run (:951) → Database.runSQL (Database.java:615):
    `if (transaction) beginTransaction(); ... lastId=prepareSQL...;
     if (lastId != -1 && transaction) commitTransaction();`
     finally: `if (transaction && _db.inTransaction()) rollbackTransaction()`.
     lastId = `SELECT last_insert_rowid()` (UtilsSQLite.java:32) — 0 or a real
     rowid, NOT -1 → commit SHOULD happen for UPDATEs. JS wrapper forwards
     transaction unchanged (dist/esm/index.js:636).

F2. RAW plugin probe (probe_run_tx.py) — from the live WebView, calling
    `window.Capacitor.Plugins.CapacitorSQLite.run({database:"vito_todos",
    statement:'UPDATE Todos SET "Order"=99 WHERE Id=2', values:[],
    transaction:true, readonly:false, returnMode:"no"`) → changes:1,
    isTransactionActive:false, and the DB FILE (pulled via `adb exec-out run-as
    app.servimus.vitotodolist cat databases/vito_todosSQLite.db` + -wal, python
    sqlite3 replays WAL) SHOWED 99, then 88 with transaction:false.
    → The raw native tx path COMMITS AND PERSISTS. Device DB is WAL mode.

F3. Mouse-path drags (synthetic DOM PointerEvents AND real
    Input.dispatchMouseEvent press-hold): UI reordered (local state via
    handleDragOver) but ZERO bridge run calls → onDragEnd computed a no-op
    (over==null or over==active) → updateOrder never ran. NOT the user's path.

F4. TOUCH-path drag (Input.dispatchTouchEvent, hold 500ms > the app's 250ms
    activationConstraint — TodoListPage.tsx:170-183 — interpolated moves,
    chase live rect, release; see touch_drag in diag_drag_variants.py):
    UI reordered AND 12 bridge `CapacitorSQLite.run` console groups ≈ 6 native
    run calls → updateOrder RAN — and the DB FILE WAS STILL THE SEED ORDER
    (app alive during pull). Force-stop + relaunch → UI reverted to seed order.
    → THE USER BUG, FULLY REPRODUCED at the app level.
    (Anomaly: 6 run calls ≠ the 3 expected from one updateOrder([2,3,1]) —
    onReorder may have fired twice, or per-call logging is doubled. Unresolved.)

F5. Schema (DatabaseService.ts): NO UNIQUE on "Order" → transient-collision
    hypothesis dead. Vitest runs better-sqlite3 (autocommit) → the plugin
    quirk CANNOT be reproduced in vitest; unit tests can only pin ordering
    logic (they already do: tests/data/TodoRepository.test.ts covers
    updateOrder rewriting Order=index).

## THE CONTRADICTION TO RESOLVE (root cause is one step away)

Raw run(UPDATE, tx=true) commits (F2) but the app's
`db.run('UPDATE Todos SET "Order"=? WHERE Id=?', [i,id], true)` via
SQLiteConnection (App.tsx createDeviceExecutor, src/App.tsx:62) appears not to
(F4) — same RW connection, same transaction:true. Something in the app path's
actual bridge options/results differs (error result? arg skew? double-call
interplay?).

## THE ONE MISSING EXPERIMENT (if ever allowed back on device — ≤30 lines)

Combine two existing scratch scripts:
  - patch window.Capacitor.Plugins.CapacitorSQLite.run (pattern: INSTRUMENT in
    diag_instrumented_drag.py) recording {statement, values, transaction,
    returnMode, RESULT(changes/lastId/error)} per call;
  - then the TOUCH drag (touch_drag in diag_drag_variants.py; NOT mouse);
  - print records. The `__calls`-empty result earlier was a MOUSE drag (fires
    no runs), so patch interception is unproven but plausible. If the patch
    doesn't intercept, parse console bridge groups (bridge_logged_calls in
    diag_drag_variants.py) — but that only gives names, not args.
DO NOT reuse diag_bridge_calls.py (abandoned mid-run; its
callFunctionOn-inside-recv-loop deadlocks on console flood).

## FIX CANDIDATES (pick after resolving the contradiction)

1. App executor ignores failures: `changes: res.changes?.changes ?? 0`
   (src/App.tsx:64) and `void onReorder(newIdOrder)` (TodoListPage.tsx:217)
   swallow per-statement errors → any native error is silent. Surface it.
2. If app-path run() results show changes:-1/error → find the arg-level cause
   in SQLiteConnection.run (node_modules/@capacitor-community/sqlite/dist/esm/
   index.js:636-673) vs the raw probe options and fix the executor call.
3. Robust bypass: switch updateOrder to `executeSet` (one transaction, its own
   commit path in Database.java:411-434 WITHOUT the lastId gate) — needs an
   executor extension; or pass transaction:false (raw probe showed tx:false
   also commits; autocommit per statement).
4. Keep repo layering: executor-first, no singletons (AGENTS.md).

## Repo changes ALREADY MADE this session (uncommitted — KEEP, they fix the Windows harness)

- .maestro/smoke/cdp.py:
  * _adb on Windows now routes through git-bash (C:\Program Files\Git\bin\
    bash.exe). Previous cmd.exe path couldn't parse POSIX redirects (>/dev/null)
    → CDP plumbing silently broken (the "No CDP page target found" S3/S4 ERRORs
    in smoke_out/report.json).
  * drive_reorder_dnd rewritten: real Input.dispatchMouseEvent with 500ms hold
    (activation), live-rect chase, release (was synthetic DOM PointerEvents,
    which never activate dnd-kit).
- .maestro/smoke/android-env.sh: Windows ANDROID_HOME/JAVA_HOME probes before
  the Mac fallbacks.
- Pre-existing dirt from previous session (cdp.py/harness.py/smoke_out/*,
  389 modified at session start) untouched.

## Scratch scripts (TMPDIR = C:\Users\molna\AppData\Local\hermes\cache\scratch)

diag_reorder_persist.py (e2e repro+DB pull) · probe_run_tx.py (raw tx probe, KEY)
diag_instrumented_drag.py (P.run patch + mouse drag) · diag_drag_variants.py
(touch drag + bridge counting, KEY) · diag_console_capture.py (mouse console
capture) · diag_bridge_calls.py (ABANDED, deadlocks).

## Environment

- Emulator Pixel_6_Pro was booted and KILLED. Reboot:
  C:\Users\molna\AppData\Local\Android\Sdk\emulator\emulator.exe -avd Pixel_6_Pro
  -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect
- adb: C:\Users molna\AppData\Local\Android\Sdk\platform-tools\adb.exe.
  App data pull: adb exec-out run-as app.servimus.vitotodolist cat
  databases/vito_todosSQLite.db (+ -wal/-shm; python sqlite3 replays WAL).
- python (Hermes 3.14) has pyyaml+websockets installed.
- Widget (Kotlin, read-only) is downstream: once reorder persists, widget
  order fixes itself (notifyAppWidgetViewDataChanged on pause).