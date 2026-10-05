# VitoTodoList — Rework to React + TypeScript + Capacitor

> **Status**: PLAN — not yet implemented.
> **Author**: Hermes Agent, October 2026.
> **Goal**: Rewrite the current .NET MAUI Android app as a React 18 + TypeScript 5 + Vite 7
> web app wrapped in Capacitor 8 (WebView), mirroring the architecture, conventions, and
> test strategy of the sibling repo `treasury-scribe` (`/Users/C5418860/temp/treasury-scribe`).
> Target outcome: an Android-only, offline-first, performant, less-flaky todo app whose
> UI is DOM-testable (CDP + JEV), replacing the fragile MAUI drag-and-drop and swipe gestures.

---

## 0. Why this rework

### Root cause of the reported bugs (MAUI)
The two reported issues both stem from .NET MAUI's cross-platform gesture layer on Android:

1. **Drag greys out but does not move.** `MainPage.xaml` wires each row `Frame` with
   `DragGestureRecognizer` + `DropGestureRecognizer`. On Android these invoke the native
   OS drag-and-drop. `OnDragStarting` sets `frame.Opacity = 0.4` (the grey-out) and the
   reorder is applied ONLY in `OnDrop` (`_todos.Move(...)`). Inside a `CollectionView`
   (RecyclerView) the native drag session frequently fails to attach a shadow / never
   routes a `Drop` back to the correct cell, so the row stays greyed with no reorder.
   There is also **no real-time rearrange** (only on drop) and **no auto-scroll** past the
   viewport — the two behaviours requested.

2. **Swipe-to-delete only right-to-left.** `SwipeView.RightItems` reveals Delete from the
   right. The left-handed user wants it on the left (`LeftItems`).

Both are symptoms of relying on MAUI's native-bridge gesture recognizers. A React/Capacitor
rewrite replaces them with mature, deterministic web libraries (pointer-based drag with live
reorder + autoscroll; CSS/touch swipe), eliminating the native-drag flakiness and making the
behaviour unit- and DOM-testable.

### Why match treasury-scribe
`treasury-scribe` is the same author's proven pattern: React 18 + TS 5 + Vite 7 + Capacitor 8,
sql.js (SQLite in WASM) persisted to `localStorage`, Vitest test-first (691 tests), and a
CDP + JEV DOM smoke harness under `.maestro/smoke/`. Reusing it gives: all business logic in
testable TypeScript, a WebView DOM that CDP+JEV can drive (the testing method originally
requested), and a single toolchain the user already operates.

---

## 1. Current MAUI app — feature inventory to preserve

Source audited: `MainPage.xaml(.cs)`, `TodoEditPage.xaml(.cs)`, `Models/TodoItem.cs`,
`Data/TodoDatabase.cs`, `Services/ExportImportService.cs`, `Platforms/Android/Widgets/*`,
`IMPLEMENTATION_SUMMARY.md`.

| # | Feature | Current MAUI location | Keep? |
|---|---------|-----------------------|-------|
| 1 | CRUD todo (title, description, optional deadline, completed, order) | `TodoDatabase`, `TodoEditPage` | Yes |
| 2 | SQLite persistence, `Order`-based sort, new item → top (others shift down) | `TodoDatabase.SaveItemAsync` / `UpdateOrderAsync` / `GetItemsAsync` | Yes |
| 3 | Reorder list items by drag | `MainPage` Drag/Drop handlers | Yes — **FIX**: live reorder + autoscroll |
| 4 | Swipe-to-delete with confirm dialog | `SwipeView.RightItems` + `DeleteCommand` | Yes — **CHANGE**: reveal from LEFT |
| 5 | Checkbox complete toggle + strikethrough on title | `OnCheckBoxChanged` + `BoolToTextDecorationConverter` | Yes |
| 6 | Auto-complete items whose deadline has passed | `LoadTodosAsync` (`Deadline <= Now → IsCompleted`) | Yes |
| 7 | Deadline display `Due: MMM dd, HH:mm` | `MainPage.xaml` label | Yes |
| 8 | Export todos → JSON (timestamped) + share sheet | `OnExportClicked` + `ExportImportService` | Yes (Capacitor Share) |
| 9 | Import todos from JSON file (new ids, reversed order) | `OnImportClicked` + `ImportFromJsonAsync` | Yes (Capacitor Filesystem/file input) |
| 10 | Share todos JSON | `OnShareClicked` | Yes (Capacitor Share) |
| 11 | Resizable, scrollable Android home-screen **widget**, tap-to-open, shows all items with ✓/•, strikethrough, Hungarian relative-day deadline (ma/hétfő…) | `Platforms/Android/Widgets/*`, `Resources/layout/*` | Yes — **native Kotlin** (see §6, the one hard part) |

### TodoItem model (current)
`Id`(PK autoinc), `Title`(≤200), `Description`(nullable), `Deadline`(nullable DateTime),
`IsCompleted`(bool), `Order`(int), `CreatedAt`(DateTime), `CompletedAt`(nullable DateTime).

### Ordering rules to replicate exactly
- `GetItemsAsync`: `ORDER BY Order ASC, CreatedAt DESC`.
- New item (`SaveItemAsync` with Id==0): increment every existing item's `Order`, insert new at `Order = 0` (top).
- Reorder (`UpdateOrderAsync`): rewrite `Order = index` for every item in the new sequence.
- Import: `ImportFromJsonAsync` reverses the list, then each item is saved as new (so it lands on top in original order).
- On load: any item with `Deadline <= now` is forced `IsCompleted = true`.

---

## 2. Target stack (mirror treasury-scribe)

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| UI framework | React | 18 | Component UI |
| Language | TypeScript | 5.x | Primary language |
| Build tool | Vite | 7.x | Dev server + bundler |
| Native bridge | Capacitor | 8.x | Android APIs (`@capacitor/core`, `/android`, `/app`, `/share`, `/filesystem`) |
| Database | sql.js | 1.14 | SQLite via WebAssembly, persisted to `localStorage` |
| Routing | React Router | 6.x | Client-side navigation (list ↔ edit) |
| Drag reorder | `@dnd-kit/core` + `@dnd-kit/sortable` | latest | Pointer-based live reorder + built-in autoscroll (fixes bug #3) |
| Swipe delete | custom pointer handler (or `react-swipeable`) | — | Left→right reveal (change #4) |
| Testing | Vitest | 4.x (+ `@vitest/coverage-v8`) | Unit/integration test framework |
| Testing utils | Testing Library + jsdom | 16.x / latest | React component + hook tests |
| Type/lint gate | `tsc --noEmit` | — | No separate lint command (same as treasury-scribe) |

**Gate (Definition of Done parity):** `npm run test` exit 0 + `npm run build` ok +
`npx tsc --noEmit` clean. New behaviour → new test. Behavioural UI flows verified via
`.maestro/smoke/` CDP+JEV harness.

App identity: keep Capacitor `appId = "app.servimus.vitotodolist"` (matches the current
MAUI `ApplicationId`) and `appName = "VitoTodoList"`. Kotlin `namespace` may differ
(Capacitor shell default) — note the installed package id for adb.

### package.json scripts (copy treasury-scribe)
```
build       → vite build
dev         → vite
test        → vitest run
test:watch  → vitest
cap:sync    → npx cap sync android
cap:open    → npx cap open android
android:run → npm run build && npx cap sync android && (cd android && ./gradlew installDebug)
```
Note: treasury-scribe's `android:run` hardcodes Windows `gradlew.bat`. On this Mac use
`./gradlew` (per android-webview-jev-testing skill).

---

## 3. Target project structure

```
vito-todo-list/                          (same repo, new stack on branch feat/rework-react-capacitor)
├── package.json · tsconfig.json · vite.config.ts · vitest.config.ts
├── index.html · capacitor.config.ts · README.md · AGENTS.md
├── docs/
│   ├── REWORK_PLAN_react-capacitor.md   # this document
│   ├── ARCHITECTURE.md                  # written after rework, mirrors treasury-scribe's
│   └── templates/                       # optional, copy from treasury-scribe
├── src/
│   ├── main.tsx · App.tsx               # entry + root (router, DB bootstrap, nav)
│   ├── models/      Todo.ts             # interface + factory + withComputedProps
│   ├── data/        DatabaseService.ts · TodoRepository.ts
│   ├── services/    ExportImportService.ts
│   ├── hooks/       useTodos.ts · useEditTodo.ts
│   ├── components/  TodoListPage.tsx · TodoEditPage.tsx · TodoRow.tsx ·
│   │                SwipeToDelete.tsx · SortableTodoRow.tsx
│   ├── pages/       TodoListPage · TodoEditPage (thin re-exports)
│   ├── __mocks__/   @capacitor/share.ts · @capacitor/filesystem.ts (no-op for tests)
│   ├── assets/      icon.svg
│   └── types/       assets.d.ts
├── android/                             # Capacitor Android shell + native widget (Kotlin, §6)
└── tests/                               # Vitest, mirrors src/
```

Keep the existing MAUI `.cs/.xaml` files in git history; the rework replaces them. Decide at
implementation time whether to delete MAUI sources in the same branch (recommended: delete in
a dedicated "remove MAUI" commit after the React app builds green, so history bisects cleanly).

---

## 4. Data layer design (sql.js, mirrors treasury-scribe)

### Todo model (`src/models/Todo.ts`)
```typescript
interface Todo {
  // Persisted
  id: number;
  title: string;                 // ≤200 enforced in UI/validation
  description: string | null;
  deadline: string | null;       // ISO 8601, nullable
  isCompleted: boolean;          // default false
  order: number;                 // default 0 (top)
  createdAt: string;             // ISO 8601
  completedAt: string | null;    // set when isCompleted → true
}
```
`createTodo(fields)` sets all defaults explicitly. DB rows reconstructed via
`withComputedProps(raw)` if any computed fields are added later (keep the pattern even if
Todo has none yet, for parity).

### DatabaseService (`src/data/DatabaseService.ts`)
- Provider: sql.js (WASM). In Capacitor WebView resolve wasm via `sql.js/dist/sql-wasm.wasm?url`;
  tests pass an `ArrayBuffer`.
- Storage key: `vito-todo-list.sqlite` (base64 snapshot in `localStorage`).
- `initDatabase(wasm?)`: `CREATE TABLE IF NOT EXISTS Todos (...)` idempotent DDL,
  `PRAGMA foreign_keys = ON`.
- `loadPersistedDatabase(wasm?, storage?)` / `persistDatabase(db, storage?)` /
  `clearPersistedDatabase(storage?)` — `storage` injectable (`StorageLike`), defaults to
  `window.localStorage`. Corrupt snapshot → discard + fresh DB.
- Persist only after a mutation, never per read.

**Todos table schema**
| Column | Type | Constraints |
|--------|------|-------------|
| Id | INTEGER | PK, AUTOINCREMENT |
| Title | TEXT | NOT NULL |
| Description | TEXT | NULLABLE |
| Deadline | TEXT | NULLABLE (ISO 8601) |
| IsCompleted | INTEGER | NOT NULL DEFAULT 0 |
| `Order` | INTEGER | NOT NULL DEFAULT 0 (quote — reserved word) |
| CreatedAt | TEXT | NOT NULL |
| CompletedAt | TEXT | NULLABLE |

### TodoRepository (`src/data/TodoRepository.ts`)
Every function takes `db: Database` as the FIRST parameter (tests inject in-memory DB).
Prepared statements with `?` binds, explicit columns, no `SELECT *`.

| Function | Behaviour (replicates MAUI `TodoDatabase`) |
|----------|--------------------------------------------|
| `getAllTodos(db)` | `SELECT ... ORDER BY "Order" ASC, CreatedAt DESC`. Then force `isCompleted=true` where `deadline <= now` (mirrors `LoadTodosAsync`); persist those flips. |
| `getTodoById(db, id)` | single row |
| `addTodo(db, todo)` | increment `"Order"` of all existing rows, insert new at `Order=0` (top). Returns new id. |
| `updateTodo(db, todo)` | update by id |
| `deleteTodo(db, id)` | hard delete (todo app has no soft-delete requirement) |
| `updateOrder(db, idsInOrder)` | rewrite `"Order" = index` for each id in sequence |
| `getAllForWidget(db)` | same as `getAllTodos` but read-only (widget consumer, §6) |

---

## 5. Presentation layer + the two fixes

### 5.1 Hooks
- `useTodos()` — list orchestrator: load/refresh, add, update, toggle-complete,
  delete (with confirm), reorder (live), export/import/share. Accepts injectable
  `share?: ShareFn` and `onDatabaseChanged` for testability (treasury-scribe pattern).
  Owns the `Todo[]` state the list renders.
- `useEditTodo(id?)` — edit-form state: title, description, has-deadline + date + time,
  validation (title required, ≤200), save. Mirrors `TodoEditPage` behaviour.

### 5.2 Routes (`App.tsx`, React Router v6)
| Path | Component | Notes |
|------|-----------|-------|
| `/` | TodoListPage | home / main list |
| `/add` | TodoEditPage | add new todo |
| `/edit/:id` | TodoEditPage | edit existing |

OS swipe-back on the edit screen via `@capacitor/app` back-button → `navigate(-1)`
(same as treasury-scribe's edit page).

### 5.3 BUGFIX #3 — live drag reorder + autoscroll (replaces MAUI DnD)

Use **`@dnd-kit`** (`@dnd-kit/core` + `@dnd-kit/sortable`). This directly delivers the two
requested behaviours that MAUI could not:

- **Live rearrange while dragging.** `SortableContext` + `useSortable` reorder the list in
  real time via `onDragOver`/`arrayMove` as the dragged row crosses neighbours — items below
  shift down as you drag down, not just on release. No grey-out-stuck state.
- **Auto-scroll past the viewport.** `@dnd-kit`'s `DndContext` has built-in `autoScroll`
  (enabled by default) that scrolls the scroll container when the pointer nears an edge —
  satisfies "scroll down the screen when dragging below the original viewport".
- **Activation.** Use `PointerSensor` (or `TouchSensor`) with a long-press/hold activation
  constraint (`delay`, `tolerance`) so a tap-hold starts the drag, matching the current
  "tap-hold-drag" gesture, while a plain tap still opens the editor.
- **Persistence.** On `onDragEnd`, compute the new id sequence and call
  `TodoRepository.updateOrder(db, ids)` + persist DB (mirrors `UpdateOrderAsync`).

Components: `SortableTodoRow.tsx` (wraps a row with `useSortable`), `TodoListPage.tsx` hosts
the `DndContext` + `SortableContext`. Keep the drag-handle affordance (the `☰` glyph) as the
drag listener target so swipe-to-delete and tap-to-edit don't conflict with drag.

Why this fixes the root cause: the bug was MAUI's native OS drag session failing inside a
RecyclerView. In a WebView there is no native drag session — `@dnd-kit` is pure pointer-event
JS with a deterministic reorder model, unit-testable and DOM-inspectable.

### 5.4 CHANGE #4 — swipe-to-delete reveals from the LEFT

The left-handed user wants the red Delete button on the **left**, revealed by a
**left-to-right** swipe (finger moves rightward).

- Implement `SwipeToDelete.tsx`: a pointer/touch handler tracking horizontal drag on the row.
  A rightward drag past a threshold reveals a red "Delete" action anchored on the LEFT edge;
  releasing past the commit threshold (or tapping the revealed button) fires delete.
- Delete shows a confirm dialog ("Delete '<title>'?", Yes/No) — matches MAUI `DeleteTodoAsync`.
- Treasury-scribe already has swipe-to-delete-with-confirm on `TransactionsPage`; reuse its
  approach, but anchor the action on the left and trigger on rightward swipe.
- Note: per android-webview-jev-testing skill, adb `input swipe` does NOT reliably trigger
  React swipe handlers (they need a held drag). So the smoke harness should exercise delete
  via the revealed button's DOM `.click()` or the hook path, not a synthetic swipe — and
  cover the swipe-direction logic with a Vitest unit test on the handler.

### 5.5 Styling
Inline React `CSSProperties`, keep the app's yellow theme (current MAUI
`YellowBackground/YellowLight/YellowMedium/YellowDark`) rather than treasury-scribe's dark
theme — preserve the existing look. No CSS framework (treasury-scribe convention).

---

## 6. The hard part — the Android home-screen widget

**This is the only feature that does NOT port cleanly to React/Capacitor.** A Capacitor app's
UI is a WebView; Android home-screen widgets must be native `RemoteViews` and cannot render
React. The current MAUI widget (`TodoWidgetProvider/Service/Factory`, `RemoteViews` ListView,
resizable, tap-to-open, Hungarian relative-day deadlines) is pure native Android.

Options (decision required before implementing — see §9 open questions):

- **Option W1 — Native Kotlin widget reading a shared store (recommended).**
  Keep a native `AppWidgetProvider` + `RemoteViewsService`/`Factory` in the Capacitor
  `android/` project (port the existing MAUI widget logic to Kotlin almost 1:1). The widget
  needs the todo data. Since the app DB is sql.js in `localStorage` (inside the WebView,
  NOT a real SQLite file the widget can read), bridge the data out: on every mutation, the
  app writes a compact JSON snapshot of todos to Android `SharedPreferences` (or a file in
  app storage) via a tiny Capacitor plugin; the Kotlin `Factory` reads that snapshot. Tap →
  `PendingIntent` launches `MainActivity` (the WebView). Reorder/complete reflect on next
  snapshot write + `notifyAppWidgetViewDataChanged`.
  - Pros: preserves full widget feature set, resizable, scrollable, tap-to-open.
  - Cons: a small Kotlin plugin + widget code; data-bridge wiring; widget is read-only.

- **Option W2 — Native Kotlin widget with its own real SQLite file.**
  Instead of sql.js, use a native SQLite DB the widget reads directly, and have the WebView
  talk to it through a Capacitor SQLite plugin (e.g. `@capacitor-community/sqlite`). This
  diverges from treasury-scribe (which uses sql.js) but gives the widget a first-class data
  source. Heavier change to the data layer.

- **Option W3 — Drop the widget (smallest scope).**
  If the widget is not important, ship the React app without it and document the removal.
  Not recommended — the widget is a listed current feature.

Recommendation: **W1** — keep sql.js for the app (treasury-scribe parity) and add a
JSON-snapshot bridge to a ported Kotlin widget. Port these existing files to Kotlin:
`TodoWidgetProvider.cs`, `TodoWidgetService.cs`, `TodoWidgetFactory.cs`,
`WidgetUpdateHelper.cs`, and the layouts `todo_widget.xml` / `todo_widget_item.xml` /
`todo_widget_info.xml` (already Android XML — reusable as-is). Keep the Hungarian
relative-day deadline formatting (ma/hétfő/kedd/…).

---

## 7. Testing strategy (mirror treasury-scribe)

### Unit / integration (Vitest, test-first)
- Fresh in-memory sql.js per test (`beforeEach initDatabase(wasm)`, `afterEach db.close()`).
  No data-layer mocks. Import vitest fns explicitly, no globals. `make*` fixture factories.
- Capacitor Share/Filesystem mocked no-op via `src/__mocks__/`.
- Coverage per layer, mirroring `tests/`:
  - `data/`: `DatabaseService` (init, persist round-trip, corrupt snapshot), `TodoRepository`
    (ordering rules: new-item-to-top, updateOrder, deadline auto-complete).
  - `services/`: `ExportImportService` (JSON round-trip, import reverses + new ids).
  - `hooks/`: `useTodos` (add/delete/toggle/reorder/import/export), `useEditTodo` (validation,
    deadline on/off, save).
  - `components/`: `TodoListPage`, `TodoEditPage`, `SwipeToDelete` (asserts rightward swipe
    reveals LEFT-anchored delete — the change-request logic), `SortableTodoRow`.
  - DnD reorder: unit-test the `onDragEnd` → `updateOrder` mapping directly (don't rely on
    simulating pointer physics).

### Behavioural smoke harness (CDP + JEV) — the originally-requested method, now applicable
Because the reworked app IS a Capacitor WebView, the `android-webview-jev-testing` skill now
applies (it did NOT for MAUI). Copy treasury-scribe's `.maestro/smoke/` harness
(`cdp.py`, `jev.py`, `harness.py`, `jev_dom_runner.py`, `scenarios.yaml`) and the skill's
reference runner. Smoke scenarios:
1. Add a todo via the add screen → it appears at the top of the list.
2. Toggle complete → title shows strikethrough.
3. Reorder: drag row 1 below row 3 → order persists after reload (verify via DOM order +
   re-query; drive the reorder through the DOM/hook, not raw adb swipe).
4. Swipe-delete: rightward swipe reveals a LEFT-anchored red Delete → confirm → row gone
   (drive via the revealed button's DOM click per the skill's adb-swipe caveat).
5. Export → Capacitor Share invoked (mock/intercept).

CDP gotchas (from skill): host Chrome holds :9222 → forward WebView socket to :9333;
re-resolve `webview_devtools_remote_<PID>` on every CDP call; `/json/list` works, `/json` may
404; trust the dumped DOM over noisy JEV verdicts; confirm `url` + testids in the dump.
Add stable `data-testid` attributes to list rows, the drag handle, the delete button, the
add/save buttons, and inputs so CDP+JEV can target them deterministically.

---

## 8. Implementation steps (phased, each ends on a green gate)

Work on branch `feat/rework-react-capacitor` (worktree at
`/Users/C5418860/temp/vito-todo-list-rework`), based on `develop`. Commit per phase with
Conventional Commits (`feat:`, `test:`, `chore:`). Gate after each phase:
`npm run test` exit 0 + `npm run build` ok + `npx tsc --noEmit` clean.

**Phase 0 — scaffold.**
`npm init`, add React 18 + TS 5 + Vite 7 + Capacitor 8 + sql.js + React Router + @dnd-kit +
Vitest + Testing Library (match treasury-scribe versions). Add `tsconfig.json`,
`vite.config.ts`, `vitest.config.ts`, `index.html`, `capacitor.config.ts`
(`appId=app.servimus.vitotodolist`), the npm scripts, and `.github/copilot-instructions.md`
+ `AGENTS.md` adapted from treasury-scribe. `npx cap add android`.

**Phase 1 — data layer (TDD).**
`models/Todo.ts`, `data/DatabaseService.ts`, `data/TodoRepository.ts`. Tests first:
ordering rules (new-to-top, updateOrder, deadline auto-complete), persist round-trip,
corrupt-snapshot recovery. Gate.

**Phase 2 — services (TDD).**
`services/ExportImportService.ts` (JSON export; import reverses + resets ids). Tests first.
Gate.

**Phase 3 — hooks (TDD).**
`hooks/useTodos.ts`, `hooks/useEditTodo.ts`. Tests first with injected DB + mocked share. Gate.

**Phase 4 — UI components.**
`App.tsx` (router + DB bootstrap + persistence), `TodoListPage`, `TodoEditPage`, `TodoRow`,
`SortableTodoRow` (@dnd-kit live reorder + autoscroll — BUGFIX #3), `SwipeToDelete`
(left-anchored, rightward-swipe — CHANGE #4). Component tests. Add `data-testid`s. Gate.

**Phase 5 — Android shell + widget (Option W1, decision-gated by §9).**
`npx cap sync android`; port the native widget to Kotlin + the JSON-snapshot bridge plugin;
reuse the existing widget XML layouts. Build the debug APK (`./gradlew assembleDebug`),
`adb install -r -g`. 

**Phase 6 — behavioural smoke (CDP + JEV).**
Copy `.maestro/smoke/` from treasury-scribe + the skill's `jev_dom_runner.py`. Run the 5
scenarios on the emulator; store DOM dumps + `report.json` under `.maestro/smoke_out/`.

**Phase 7 — remove MAUI + docs.**
Delete the MAUI sources (`*.xaml`, `*.cs`, `VitoTodoList.csproj`, `Platforms/` MAUI bits,
`.sln`) in a dedicated commit once the React app is green on-device. Write `docs/ARCHITECTURE.md`
mirroring treasury-scribe's. Update `README.md`. Open PR into `develop`.

---

## 9. Open questions (resolve before Phase 5)

1. **Widget**: confirm Option W1 (native Kotlin widget + JSON-snapshot bridge, keep sql.js) vs
   W2 (native SQLite via `@capacitor-community/sqlite`) vs W3 (drop widget). W1 recommended.
2. **MAUI removal**: delete MAUI sources in this branch (recommended) or keep them until the
   React app is proven on-device in a follow-up?
3. **Emulator vs device**: treasury-scribe notes emulators are unreliable for its
   NotificationListener — but this todo app has no notification listener, so the emulator is
   fine for smoke testing here.
4. **Swipe library**: hand-rolled pointer handler (full control over left-anchor direction) vs
   a library like `react-swipeable`. Hand-rolled recommended for exact left-handed behaviour.
5. **Package/namespace**: keep `app.servimus.vitotodolist`? (matches current MAUI id).

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Widget cannot read sql.js (`localStorage`) data | JSON-snapshot bridge to SharedPreferences on every mutation (W1), or native SQLite (W2) |
| @dnd-kit autoscroll not firing inside a custom scroll container | Ensure the scrollable list is the DndContext scroll container; configure `autoScroll` threshold/acceleration; test on-device |
| Swipe-delete gesture conflicts with drag activation and tap-to-edit | Separate activators: drag only from the `☰` handle (hold), swipe only horizontal past threshold, tap elsewhere opens editor |
| adb swipe won't trigger React swipe in smoke tests | Drive delete via DOM click / hook; cover swipe-direction with unit tests (skill caveat) |
| Data loss migrating existing on-device MAUI SQLite DB | Out of scope unless the user has real data to preserve; if so, add a one-time import of the old `todos.db3` → sql.js (needs a native read of the MAUI DB file). Flag as a separate task. |
| sql.js wasm path resolution in Capacitor WebView | Use `sql.js/dist/sql-wasm.wasm?url` (treasury-scribe proven); verify after `cap sync` |

---

## 11. Definition of Done (parity with treasury-scribe)

1. Both original asks satisfied: live drag reorder + autoscroll (bugfix), left-anchored
   rightward swipe-delete (change request).
2. All current features preserved (§1 table), widget per chosen option.
3. `npm run test` exit 0, new behaviour has new tests, coverage held high.
4. `npm run build` ok, `npx tsc --noEmit` clean.
5. Behavioural smoke harness green on emulator (DOM dumps as evidence).
6. Conventional commits on `feat/rework-react-capacitor`; PR into `develop`.
7. `docs/ARCHITECTURE.md` + `README.md` updated to the new stack.


