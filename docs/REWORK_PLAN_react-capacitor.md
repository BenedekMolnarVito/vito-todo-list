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
|| 8 | Export todos → JSON (timestamped) + download | `OnExportClicked` + `ExportImportService` | Yes (browser download) ||
|| 9 | Import todos from JSON file (new ids, reversed order) | `OnImportClicked` + `ImportFromJsonAsync` | Yes (file input) ||
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
|| Native bridge       | Capacitor | 8.x | Android APIs (`@capacitor/core`, `/android`, `/app`) |
| Database | `@capacitor-community/sqlite` | latest | Real on-device SQLite file (shared with native widget — see §6). NOT sql.js — deliberate divergence from treasury-scribe so the Kotlin widget can read the same DB |
| Routing | React Router | 6.x | Client-side navigation (list ↔ edit) |
| Drag reorder | `@dnd-kit/core` + `@dnd-kit/sortable` | latest | Pointer-based live reorder + built-in autoscroll (fixes bug #3) |
| Swipe delete | `react-swipeable-list` (fallback: hand-rolled) | 1.10.0 | Leading/trailing swipe actions, configurable — left-anchored delete (change #4). §9 Q4 |
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
│   ├── models/      Todo.ts             # interface + factory (createTodo)
│   ├── data/        DatabaseService.ts · TodoRepository.ts
│   ├── services/    ExportImportService.ts
│   ├── hooks/       useTodos.ts · useEditTodo.ts
│   ├── components/  TodoListPage.tsx · TodoEditPage.tsx · TodoRow.tsx ·
│   │                SwipeToDelete.tsx · SortableTodoRow.tsx
│   ├── pages/       TodoListPage · TodoEditPage (thin re-exports)
│   ├── __mocks__/   @capacitor-community/sqlite.ts · @capacitor/app.ts (no-op for tests)
│   ├── assets/      icon.svg
│   └── types/       assets.d.ts
├── android/                             # Capacitor Android shell + native widget (Kotlin, §6)
└── tests/                               # Vitest, mirrors src/
```

Keep the existing MAUI `.cs/.xaml` files in git history; the rework replaces them. Decide at
implementation time whether to delete MAUI sources in the same branch (recommended: delete in
a dedicated "remove MAUI" commit after the React app builds green, so history bisects cleanly).

---

## 4. Data layer design (`@capacitor-community/sqlite` on-device SQLite; executor-first repos)

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
`createTodo(fields)` sets all defaults explicitly. Todo has no computed fields, so no
`withComputedProps` helper is needed (unlike treasury-scribe's Transaction); add one only if a
computed field is introduced later.

### DatabaseService (`src/data/DatabaseService.ts`)
- Provider: **`@capacitor-community/sqlite`** — a real on-device SQLite file (NOT sql.js). See
  §6 for why (the native widget reads the same file).
- DB name: `vito_todos` (so the Kotlin widget can open the same database by name/path).
- `initDatabase(executor?)`: create/open the connection, run `CREATE TABLE IF NOT EXISTS
  Todos (...)` idempotent DDL. No `localStorage` snapshot step — writes hit the file directly.
- Abstraction for testability: define a small `SqliteExecutor` interface (`run`, `query`,
  `execute`) that `@capacitor-community/sqlite` implements on-device and a node sqlite driver
  (e.g. better-sqlite3) implements in tests. Repository functions take the executor FIRST
  (same spirit as treasury-scribe's `db`-first convention). Document the final choice in
  `docs/ARCHITECTURE.md`.
- `clearAll(executor)` — `DELETE FROM Todos` (replaces the old clear-persisted-DB call).

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
Every function takes `exec: SqliteExecutor` as the FIRST parameter (tests inject a node
sqlite executor; app injects the `@capacitor-community/sqlite` one — see §4/§6).
Prepared statements with `?` binds, explicit columns, no `SELECT *`.

| Function | Behaviour (replicates MAUI `TodoDatabase`) |
|----------|--------------------------------------------|
| `getAllTodos(exec)` | `SELECT ... ORDER BY "Order" ASC, CreatedAt DESC`. Then force `isCompleted=true` where `deadline <= now` (mirrors `LoadTodosAsync`); persist those flips. |
| `getTodoById(exec, id)` | single row |
| `addTodo(exec, todo)` | increment `"Order"` of all existing rows, insert new at `Order=0` (top). Returns new id. |
| `updateTodo(exec, todo)` | update by id |
| `deleteTodo(exec, id)` | hard delete (todo app has no soft-delete requirement) |
| `updateOrder(exec, idsInOrder)` | rewrite `"Order" = index` for each id in sequence |
| `getAllForWidget(exec)` | same query as `getAllTodos` (the native Kotlin widget runs the equivalent SQL directly against the shared DB file, §6) |

---

## 5. Presentation layer + the two fixes

### 5.1 Hooks
- `useTodos()` — list orchestrator: load/refresh, add, update, toggle-complete,
  delete (with confirm), reorder (live), export/import. Accepts injectable
  `onDatabaseChanged` for testability (treasury-scribe pattern). Owns the `Todo[]`
  state the list renders.
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

- Implement `SwipeToDelete.tsx` using **`react-swipeable-list`** (see §9 Q4): render the row
  inside `<SwipeableListItem leadingActions={...}>` with a red, `destructive` Delete action in
  `LeadingActions` so it sits on the LEFT and is revealed by a rightward (left-to-right) swipe.
  Use `type="ANDROID"`, a sensible `threshold`, and `destructiveCallbackDelay` for the delete
  animation. Keep this component boundary stable so a hand-rolled fallback is a drop-in swap if
  the library's React-18 peer compat disappoints at install.
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

## 6. The Android home-screen widget — DECISION: Option W2 (native SQLite)

**This is the one feature that does NOT render in a WebView.** Android home-screen widgets
must be native `RemoteViews`; React cannot draw them. The current MAUI widget
(`TodoWidgetProvider/Service/Factory`, `RemoteViews` ListView, resizable, tap-to-open,
Hungarian relative-day deadlines) is pure native Android.

**Chosen strategy — W2: a real on-device SQLite file, shared by the WebView app and the
native widget.** This is a deliberate divergence from treasury-scribe (which uses sql.js):
instead of sql.js serialised to `localStorage`, the app's database is a genuine SQLite file
on the device, accessed from TypeScript through the **`@capacitor-community/sqlite`** plugin.
The native Kotlin widget reads that same SQLite file directly — the widget gets a
first-class, always-current data source with no snapshot-bridge hack.

Consequences (reflected throughout this plan):
- **Data layer uses `@capacitor-community/sqlite`, NOT sql.js.** `DatabaseService` opens a
  named connection (e.g. `vito_todos`), runs the DDL, and executes queries via the plugin
  (`createConnection` / `open` / `execute` / `query` / `run`). On Android the plugin stores
  the DB under the app's databases dir; expose it so the widget's Kotlin code can open the
  same file (same DB name; use the plugin's documented on-device path).
- **No `localStorage` persistence step** — writes land in the real DB file immediately; drop
  the base64 snapshot/`persistDatabase` machinery entirely.
- **Tests** can no longer use in-memory sql.js. Options (pick in Phase 1): (a) run the data
  layer against better-sqlite3 / node sqlite in Vitest by abstracting the DB behind a small
  `SqliteExecutor` interface that `@capacitor-community/sqlite` implements on-device and a
  node driver implements in tests; or (b) use the plugin's web/electron implementation
  (jeep-sqlite / sql.js under the hood) in jsdom. Prefer (a): keep all repository functions
  taking an `executor` first arg (same spirit as treasury-scribe's `db`-first convention) so
  tests inject a node-backed executor and the app injects the Capacitor one. Document the
  chosen approach in `docs/ARCHITECTURE.md`.
- **Native widget (Kotlin), ported ~1:1 from the MAUI widget.** `AppWidgetProvider` +
  `RemoteViewsService`/`RemoteViewsFactory` in the Capacitor `android/` project; the Factory
  opens the shared SQLite file (read-only) and builds the `RemoteViews` list. Reuse the
  existing Android XML layouts as-is: `todo_widget.xml`, `todo_widget_item.xml`,
  `todo_widget_info.xml`. Keep tap-to-open (`PendingIntent` → `MainActivity`) and the
  Hungarian relative-day deadline formatting (ma/hétfő/kedd/…). After an app mutation, call
  `AppWidgetManager.notifyAppWidgetViewDataChanged` so the widget refreshes.
- **Concurrency**: app writes + widget reads hit the same file. Rely on SQLite's locking;
  keep the widget strictly read-only; the widget re-queries on `onDataSetChanged`.

Risk accepted by choosing W2: a heavier data-layer change and app↔widget file-sharing
wiring, in exchange for a widget with a real, live data source (no JSON snapshot bridge).

---

## 7. Testing strategy (mirror treasury-scribe)

### Unit / integration (Vitest, test-first)
- Data-layer tests run against a node SQLite driver (e.g. better-sqlite3) injected through the
  `SqliteExecutor` interface (§4/§6) — a fresh in-memory DB per test (`beforeEach` init DDL,
  `afterEach` close). No data-layer mocks. Import vitest fns explicitly, no globals. `make*`
  fixture factories. (The on-device app uses `@capacitor-community/sqlite` for the same
  interface.)
  - Coverage per layer, mirroring `tests/`:
  - `data/`: `DatabaseService` (init DDL idempotent), `TodoRepository`
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
`/Users/C5418860/temp/vito-todo-list-rework`), based on `develop`.
**Commit discipline (user directive): commit regularly** — at minimum after every phase and
after every green gate, with Conventional Commits (`feat:`, `test:`, `chore:`), so any phase
can be reverted independently if something goes wrong. Gate after each phase:
`npm run test` exit 0 + `npm run build` ok + `npx tsc --noEmit` clean. Never commit a red gate.

**Phase 0 — scaffold.**
`npm init`, add React 18 + TS 5 + Vite 7 + Capacitor 8 + `@capacitor-community/sqlite` +
a node sqlite driver for tests (e.g. better-sqlite3, devDependency) + React Router + @dnd-kit +
Vitest + Testing Library. Add `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`,
`index.html`, `capacitor.config.ts` (`appId=app.servimus.vitotodolist`), the npm scripts, and
`.github/copilot-instructions.md` + `AGENTS.md` adapted from treasury-scribe. `npx cap add android`.

**Phase 1 — data layer (TDD).**
`models/Todo.ts`, `data/SqliteExecutor.ts` (interface + node-driver impl for tests),
`data/DatabaseService.ts`, `data/TodoRepository.ts`. Tests first against the node executor:
ordering rules (new-to-top, updateOrder, deadline auto-complete), DDL idempotency, CRUD. Gate.

**Phase 2 — services (TDD).**
`services/ExportImportService.ts` (JSON export; import reverses + resets ids). Tests first.
Gate.

**Phase 3 — hooks (TDD).**
`hooks/useTodos.ts`, `hooks/useEditTodo.ts`. Tests first with injected executor.
Acceptance (testable):
- `useTodos` exposes `{ todos, loading, add, update, toggleComplete, remove, reorder, exportJson,
  importJson }`; `toggleComplete(id)` sets `completedAt=now` when completing / `null` when
  un-completing and persists; `remove(id)` only deletes after a confirm callback resolves true;
  `reorder(fromId,toId|newIdOrder)` calls `TodoRepository.updateOrder` and reflects new order.
- `useEditTodo(id?)`: `title` required and ≤200 chars (save rejected otherwise with a validation
  flag); deadline is composed from a date + a time only when `hasDeadline` is true, else `null`;
  `save()` inserts when `id` absent (lands at top) or updates when present.
- Both hooks accept an injectable executor; no direct Capacitor import at call time.
Gate.

**Phase 4 — UI components.**
`App.tsx` (router + DB bootstrap), `TodoListPage`, `TodoEditPage`, `TodoRow`,
`SortableTodoRow` (@dnd-kit — BUGFIX #3), `SwipeToDelete` (react-swipeable-list — CHANGE #4).
Acceptance (testable):
- BUGFIX #3: dragging a row reorders the list in REAL TIME (list state changes during
  `onDragOver`, not only on drop); `DndContext autoScroll` is enabled so dragging near the
  bottom edge scrolls the list; drag is activated by a long-press on the `☰` handle; a plain tap
  on the row opens the editor (no drag); on drop, order persists via `updateOrder`.
- CHANGE #4: the red Delete sits on the LEFT (`leadingActions`) and is revealed by a rightward
  (left-to-right) swipe; triggering it shows the confirm dialog; confirming removes the row.
  A unit/component test asserts the delete action is in `LeadingActions` (left), NOT trailing.
- Visual: keep the existing yellow theme; completed items show strikethrough title; past-deadline
  items show as completed; deadline label `Due: MMM dd, HH:mm`.
- Every interactive element gets a stable `data-testid` (row, drag handle, delete, checkbox,
  add button, title/description/deadline inputs, save/cancel) for CDP+JEV targeting.
Gate.

**Phase 5 — Android shell + native widget (Option W2 — see §6).**
`npx cap sync android`; wire `@capacitor-community/sqlite` on Android (the real DB file).
Port the widget to Kotlin (`AppWidgetProvider` + `RemoteViewsService`/`Factory`) reading the
SAME SQLite file read-only; reuse the existing widget XML layouts. Build the debug APK
(`./gradlew assembleDebug`), `adb install -r -g`. Verify the widget shows live data and
tap-to-open works. Commit.

**Phase 6 — behavioural smoke (DOM-based JEV, the originally-requested test method).**
Copy `.maestro/smoke/` from treasury-scribe + the skill's `jev_dom_runner.py`. Implement and
run the smoke scenarios (§7) on the emulator via CDP DOM extraction + JEV verdicts; store DOM
dumps + `report.json` under `.maestro/smoke_out/`. This is a required deliverable, not
optional. Commit the harness + evidence.

**Phase 7 — remove MAUI + docs.**
Delete the MAUI sources (per §9 Q2 list) in a dedicated commit once the React app is green
on-device. Write `docs/ARCHITECTURE.md` mirroring treasury-scribe's. Update `README.md`.
**Update `AGENTS.md`** to describe the new React+TS+Vite+Capacitor stack, the toolchain
(`npm run test` / `build` / `npx tsc --noEmit` gate, `cap:sync`, `android:run` with
`./gradlew`), the layer duties, the W2 SQLite+widget decision, and the conventions
(executor-first repo fns, test-first, no-globals vitest) — the current MAUI `AGENTS.md`/
copilot-instructions must not describe a stack that no longer exists. Open PR into `develop`.

---

## 9. Open questions

1. **Widget**: ✅ RESOLVED — **Option W2** chosen by the user: native Kotlin widget reading a
   real on-device SQLite file via `@capacitor-community/sqlite` (NOT sql.js). See §6.
2. **MAUI removal**: ✅ RESOLVED — delete ALL MAUI sources, libraries, and dependencies in
   this branch (user: "I can revert from main if need be"). Do it in a dedicated commit in
   Phase 7 once the React app is green. Remove `*.xaml(.cs)`, `VitoTodoList.csproj`,
   `vito-todo-list.sln`, MAUI `Platforms/` bits, `Resources/Styles|AppIcon|Splash` MAUI assets,
   `App.xaml`, `AppShell.xaml`, `GlobalXmlns.cs`, `MauiProgram.cs`, `IMPLEMENTATION_SUMMARY.md`
   — keeping only what the Capacitor project needs (the Android widget XML layouts are reused).
3. **Emulator vs device**: this todo app has no notification listener, so the emulator is
   fine for the DOM-based JEV smoke testing (Phase 6).
4. **Swipe library**: ✅ RESOLVED via web search — use **`react-swipeable-list`** (npm,
   v1.10.0, 0 deps, built-in TS types, pure web-React/react-dom). It supports BOTH
   `LeadingActions` (left swipe) and `TrailingActions` (right swipe) with configurable
   `threshold` and a `destructive` delete action — directly enabling the left-handed
   requirement via `leadingActions` (red Delete on the LEFT, revealed by a rightward swipe).
   Caveats to verify at install: it was last published ~2 years ago and targets React 18 —
   run `npm ls react` / check peer deps; if React-18 peer compat or maintenance is a problem,
   **fall back to the hand-rolled pointer handler** (user's instruction). Keep the component
   boundary (`SwipeToDelete.tsx`) identical either way so the fallback is a drop-in swap.
5. **Package/namespace**: ✅ RESOLVED — keep `appId = app.servimus.vitotodolist` (user).

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Widget cannot read sql.js (`localStorage`) data | Resolved by W2: app + widget share ONE real SQLite file via `@capacitor-community/sqlite`; widget opens it read-only |
| App write vs widget read on the same SQLite file | Keep the widget strictly read-only; rely on SQLite file locking; widget re-queries on `onDataSetChanged` after each app mutation |
| @dnd-kit autoscroll not firing inside a custom scroll container | Ensure the scrollable list is the DndContext scroll container; configure `autoScroll` threshold/acceleration; test on-device |
| Swipe-delete gesture conflicts with drag activation and tap-to-edit | Separate activators: drag only from the `☰` handle (hold), swipe only horizontal past threshold, tap elsewhere opens editor |
| adb swipe won't trigger React swipe in smoke tests | Drive delete via DOM click / hook; cover swipe-direction with unit tests (skill caveat) |
| Data loss migrating existing on-device MAUI SQLite DB | Out of scope unless the user has real data to preserve; if so, add a one-time import of the old `todos.db3`. Flag as a separate task. |
| `@capacitor-community/sqlite` on-device DB path / name mismatch between app and widget | Pin the DB name (`vito_todos`); confirm the plugin's Android storage path and open the same file from Kotlin; verify after `cap sync` + on-device |

---

## 11. Definition of Done (parity with treasury-scribe)

1. Both original asks satisfied: live drag reorder + autoscroll (bugfix), left-anchored
   rightward swipe-delete (change request).
2. All current features preserved (§1 table), widget per chosen option.
3. `npm run test` exit 0, new behaviour has new tests, coverage held high.
4. `npm run build` ok, `npx tsc --noEmit` clean.
5. **DOM-based JEV smoke harness green on the emulator** (required deliverable) — CDP DOM
   dumps + `report.json` as evidence for all §7 scenarios.
6. Conventional commits on `feat/rework-react-capacitor`; PR into `develop`.
7. `docs/ARCHITECTURE.md`, `README.md`, AND `AGENTS.md` updated to the new stack (no residual
   MAUI references anywhere in docs/instructions).
8. **Legacy JSON export round-trips** (§12): the user's existing MAUI export imports cleanly
   into the reworked app with no data loss, verified by a test against the reference fixture
   AND against the user's real file before they rely on it.

---

## 12. JSON export/import backward-compatibility (HIGH PRIORITY)

The user has a REAL exported JSON from the current MAUI app and will re-import it after
reinstalling. The rework MUST import that file losslessly. This section pins the exact legacy
format so the new import is backward-compatible, and defines the forward format.

### 12.1 Exact legacy (MAUI) export format
From `Services/ExportImportService.cs` (`JsonSerializer.Serialize(items, { WriteIndented = true })`)
and `Models/TodoItem.cs`. No custom naming policy or converters exist (verified by search), so
System.Text.Json defaults apply:
- **Root** = a JSON **array** of todo objects (serialized `List<TodoItem>`).
- **Keys = PascalCase**, in `TodoItem` declaration order:
  `Id, Title, Description, Deadline, IsCompleted, Order, CreatedAt, CompletedAt`.
- Types: `Id`/`Order` = number; `Title` = string; `Description`/`Deadline`/`CompletedAt`
  = string or `null`; `IsCompleted` = `true`/`false`; `CreatedAt` = string.
- `DateTime`/`DateTime?` serialize as ISO-8601 round-trip strings WITHOUT a timezone offset
  (local kind), fractional seconds present when non-zero, e.g. `"2026-02-20T09:15:42.1234567"`
  or `"2026-02-28T14:30:00"`. `null` for absent nullable dates.
- Pretty-printed, 2-space indent (irrelevant to parsing).

A reference fixture reproducing this exactly: `tests/fixtures/legacy-maui-export.sample.json`.
The user's REAL exported file is also in the repo: `docs/todos_export_20261005_130422.json`
(46 todos). ⚠️ It contains PERSONAL DATA (contacts, and at least one credential-looking
string). Treat it as sensitive: use it only as a local import-test fixture, never print/log its
values, and do not commit it to any public remote. Confirmed: the real file matches the
format in 12.1 exactly (array, PascalCase, declaration order, ISO no-offset dates, nulls).

> ✅ **Validated against the user's real export.** The hand-built fixture's shape is confirmed
> correct by the real file. The real file additionally exercises the escaping/encoding and
> multiline cases below — the importer MUST handle all of them.

**Encoding/escaping facts observed in the REAL file (importer + round-trip MUST handle):**
- System.Text.Json escapes many chars as `\uXXXX`: `+`→`\u002B`, `>`→`\u003E`, `<`→`\u003C`,
  `'`→`\u0027`, `&`→`\u0026`, and ALL non-ASCII (Hungarian accents `á`→`\u00E1`, `ő`→`\u0151`,
  `ü`→`\u00FC`, `ö`→`\u00F6`, `í`→`\u00ED`, uppercase `Á É Ö Ü` etc.). These are standard JSON
  unicode escapes — `JSON.parse()` decodes them natively, so IMPORT needs no special handling.
- BUT a rework EXPORT via `JSON.stringify` emits raw UTF-8 (does NOT re-escape to `\uXXXX`), so
  the exported bytes will DIFFER from the old file even for identical data.
  **Round-trip tests MUST compare PARSED VALUES, never raw bytes/strings.**
- Descriptions contain embedded newlines (`\n`) — multiline text must survive round-trip.
- Fractional seconds vary in length (7 digits like `.2710849`, but also `.062671`, `.754714`).
  Date parsing must accept variable-precision fractional seconds (and `null`).
- Date-only deadlines appear as `...T00:00:00` (midnight). The widget's Hungarian relative-day
  logic keys off this (time == 00:00 → show day name only) — preserve it (see §6).
- `Id` values are large and non-contiguous (e.g. 526, 7, 587) and `Order` is 0..45 ascending —
  import ignores the old `Id` (reassigns) but the reverse-then-insert rule reproduces order.

### 12.2 Legacy → new `Todo` model field mapping
The new TS model (§4) uses camelCase. The importer must accept PascalCase legacy keys and map:

| Legacy (PascalCase) | New `Todo` (camelCase) | Transform on import |
|---------------------|------------------------|---------------------|
| `Id` | `id` | reset to 0/new (re-insert as new rows, mirror MAUI import) |
| `Title` | `title` | copy |
| `Description` | `description` | copy (null → null) |
| `Deadline` | `deadline` | copy ISO string; normalise to a canonical ISO form the app uses |
| `IsCompleted` | `isCompleted` | copy |
| `Order` | `order` | recompute on insert per MAUI import semantics (see 12.4) |
| `CreatedAt` | `createdAt` | copy; if missing, set now |
| `CompletedAt` | `completedAt` | copy (null → null) |

The importer should be TOLERANT: accept either PascalCase (legacy) or camelCase (new export)
keys, so both old files and the app's own future exports import. Implement a case-insensitive
key lookup (or try PascalCase then camelCase) in `ExportImportService.importFromJson`.

### 12.3 New (rework) export format
Export the app's own data as a JSON array of the new `Todo` shape. Decision for the forward
format: emit **camelCase** keys (idiomatic TS) AND keep the importer able to read PascalCase
so legacy files still load. Document this in `docs/ARCHITECTURE.md`. (If strict visual parity
with the old file is wanted, an export option could emit PascalCase — not required.)

### 12.4 Import semantics to replicate (from MAUI `OnImportClicked` + `ImportFromJsonAsync`)
- `ImportFromJsonAsync` **reverses** the deserialized list, then each item is saved as NEW
  (`item.Id = 0`), so items land on top in their original order. Replicate exactly: reverse,
  then `addTodo` each (which puts each at `Order = 0`, shifting others down) → net result is
  original order preserved at the top of the list.
- Invalid JSON → return null/empty, surface an error (MAUI shows "Invalid JSON format").

### 12.5 Required tests (Phase 2, test-first)
1. Import `tests/fixtures/legacy-maui-export.sample.json` → 3 todos with correct
   title/description/deadline/isCompleted/completedAt; ids reassigned; order = original after
   the reverse-then-insert rule.
2. Round-trip: export (new format) → import → deep-equal on all fields except id.
3. Tolerant keys: a camelCase file AND a PascalCase file both import to identical todos.
4. Deadline/date parsing: ISO strings with and without fractional seconds both parse.
5. Invalid JSON → graceful error, no DB mutation.
6. (Required, before go-live) import the user's REAL file
   `docs/todos_export_20261005_130422.json` in a test (or on-device) → all 46 todos present,
   Hungarian accents and `\u002B`/`\u003E` sequences render as proper characters, multiline
   descriptions intact, completed item (`IsCompleted:true` with `CompletedAt`) preserved,
   order matches the original top-to-bottom sequence. Do NOT print the file's contents in logs.

---

## 13. Execution model — subagent-driven, fresh-context swarm

Implementation will be an ORCHESTRATED SWARM: a parent dispatches subagents, each with a
FRESH, ISOLATED context window that knows NOTHING of this conversation. Write and sequence the
work so that holds. Rules the orchestrator and every task MUST follow:

### 13.1 This plan is the single source of truth
- Every subagent task says, up front: "Read `docs/REWORK_PLAN_react-capacitor.md` (authoritative)
  and `AGENTS.md` first." Do NOT paste large briefs inline — large inline dispatch prompts time
  out the stream. Keep the dispatch prompt SHORT and point at the file.
- Each task names the EXACT files it owns, its acceptance criteria (from the phase + DoD), and
  the commands to prove green (`npm run test`, `npm run build`, `npx tsc --noEmit`).
- Subagent reports, diffs, and review packages go to FILES in the worktree, never inline.

### 13.2 Phase dependency order (mostly serial — later phases import earlier ones)
`0 scaffold → 1 data → 2 services → 3 hooks → 4 UI → 5 android+widget → 6 smoke → 7 cleanup`.
Phases 1→4 are a dependency chain (services import data, hooks import services, UI imports
hooks) and should run SERIALLY. Do not parallelize across these layers.

### 13.3 Where parallelism is safe (proven pattern)
Within a phase, split into FILE-DISJOINT clusters (verify ZERO file overlap first); give each
cluster its own git worktree + branch (run `npm ci` per worktree — `node_modules` is not
shared); run tasks serially inside a cluster, clusters in parallel; merge disjoint branches
back with `--no-ff` (zero conflicts). Examples:
- Phase 1: `models/Todo.ts` + `data/SqliteExecutor.ts` + `data/DatabaseService.ts` +
  `data/TodoRepository.ts` mostly touch distinct files but `TodoRepository` imports the model
  and executor — keep Phase 1 as ONE cluster (serial) to avoid import races.
- Phase 4: `SortableTodoRow.tsx` (drag) and `SwipeToDelete.tsx` (swipe) are file-disjoint and
  can be two parallel sub-tasks, each merged `--no-ff`; `TodoListPage.tsx` that composes both
  is a THIRD serial task AFTER both merge.

### 13.4 Model tier per task (resolve alias from config, don't hardcode)
- deep: architecture/ambiguous/root-cause — e.g. the SqliteExecutor abstraction + widget
  SQLite-sharing design, the @dnd-kit live-reorder+autoscroll integration.
- standard (default): scoped implementation with clear acceptance — most phases/files.
- quick: verification, fetches, mechanical checks — e.g. "run the gate and report pass/fail".

### 13.5 Fresh-context guardrails (because subagents know nothing)
- Pass every constraint the task needs IN the task context or via the plan file — never assume
  shared memory of this chat.
- Verify external side effects yourself (file written, APK installed, DB row present) — a
  subagent's "done" is a self-report, not proof. For on-device claims require a real artifact
  (APK path, adb output, DOM dump).
- A subagent cannot ask the user questions. If a task hits a genuine ambiguity not resolved by
  the plan, it must STOP and report back to the parent, not guess.
- Commit after every green gate (see §8). Each phase/cluster commit is a revert point.
- Children cannot close/transition tracked work; the parent applies merges and transitions.

### 13.6 Smoke-test subagent (Phase 6) specifics
The DOM-based JEV harness needs a running emulator + the installed APK + `TYPESAFE_API_KEY`.
That environment is NOT reproducible in a bare child context — run Phase 6 either in the parent
or in a child explicitly given the env bootstrap (adb/emulator PATH, key load per the
android-webview-jev-testing skill). The child returns the DOM dumps + `report.json` paths; the
parent verifies them.

---

## 14. Plan review record (JEV AC-completeness + manual consistency pass)

Reviewed with the `jev-team-roles` `ac_completeness` scorer (TypeSafe JEV) per phase, plus a
manual cross-section consistency sweep. Date: 2026-10-05.

JEV AC-completeness scores (higher = more complete/testable):
| Phase | Score |
|-------|-------|
| 0 scaffold | 1.63 |
| 1 data layer | 1.71 |
| 2 services (export/import) | 1.94 |
| 3 hooks | 1.55 → tightened |
| 4 UI | 1.54 → tightened |
| 5 android+widget (W2) | 1.68 |
| 6 smoke (JEV) | 1.65 |
| 7 cleanup+docs | 1.55 |

Findings & actions:
- No phase was a severe outlier; the plan is uniformly specified. Phases 3 (hooks) and 4 (UI)
  scored lowest (behavioural/subjective ACs) → both were rewritten with explicit, testable
  acceptance criteria (see §8).
- Manual sweep fixed stale references: §4 header no longer says "sql.js"; the `withComputedProps`
  helper is marked not-needed (Todo has no computed fields); confirmed no residual Option-W1 /
  JSON-snapshot-bridge wording remains in the active decision (only in the §6/§10 "resolved by
  W2" context lines).
- Known residual sql.js mentions are INTENTIONAL (they state the deliberate divergence: "NOT
  sql.js"), not inconsistencies.


