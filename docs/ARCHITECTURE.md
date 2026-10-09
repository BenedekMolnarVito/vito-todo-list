# VitoTodoList — Architecture

> React 18 + TypeScript 5 + Vite 7 todo-list app for **Android via Capacitor 8**,
> with on-device SQLite shared between the web layer and a native Kotlin home-screen
> widget. Reworked from the original .NET MAUI app (removed in the
> `feat/rework-react-capacitor` branch; see git history for the MAUI version).

## 1. Stack

| Concern            | Choice                                             |
|--------------------|----------------------------------------------------|
| UI                 | React 18 + TypeScript 5                            |
| Build / dev        | Vite 7                                             |
| Native shell       | Capacitor 8 (Android)                              |
| On-device DB       | `@capacitor-community/sqlite` (^8.1.1)             |
|| Drag reorder       | `@dnd-kit/core` + `@dnd-kit/sortable`              ||
|| Swipe-delete       | hand-rolled `SwipeToDelete` (left-anchored)¹       ||
|| Routing            | `react-router-dom`                                 ||
| Test               | Vitest + Testing Library + jsdom                   |
| Type/lint gate     | `tsc --noEmit` (no separate linter)                |
| Widget             | native Kotlin (RemoteViews) reading the shared DB  |

¹ `react-swipeable-list` was the planned library (§9 Q4) but needs `prop-types`
(absent from the dependency tree), so a hand-rolled `SwipeToDelete` with the same
component boundary is used instead — a drop-in swap, authorized by plan §9 Q4.

App identity: Capacitor `appId = "app.servimus.vitotodolist"`, `appName =
"VitoTodoList"` (matches the former MAUI `ApplicationId`). The installed Android
package id is `app.servimus.vitotodolist`.

## 2. Layers (strict duty, top → bottom)

```
React components (src/components/)   stateless render + local UI gesture state only
  ↓   props/callbacks
React hooks (src/hooks/)             useTodos / useEditTodo own screen state + orchestration
  ↓   injected deps (executor, share, confirm)
Services (src/services/)             ExportImportService: JSON export/import (tolerant schema)
Repository (src/data/TodoRepository) all SQL; MAUI ordering parity; executor-first functions
  ↓
SqliteExecutor (src/data/)           thin async DB interface; two implementations:
                                       • device  = @capacitor-community/sqlite (real on-device)
                                       • web/test = in-memory / better-sqlite3 (dev only)
  ↓
SQLite file "vito_todos"             shared with the native Kotlin widget (read-only there)
```

- **Executor-first repository.** `TodoRepository` functions take a `SqliteExecutor`
  as their first argument (no singleton DB import), so tests inject an in-memory
  executor and app code injects the device one. Chosen in `App.tsx` behind
  `Capacitor.isNativePlatform()` — real plugin on device, web-shim in the browser
  and in tests.
- **Hooks own state, components are dumb.** `useTodos` owns the list state and
  mutations (add/toggle/remove/reorder/export/import); `useEditTodo` owns the
  edit-screen state. Components render props and raise callbacks.
- **Dependency injection, not globals.** Hooks receive the executor and a
  `confirm` function as injected deps — swappable in tests.

## 3. Data model & schema

`src/models/Todo.ts` — the TS model (camelCase), mirroring the former MAUI
`TodoItem`. `createTodo(partial)` is the factory: all defaults set explicitly, then
the partial overlaid (`id=0` means unsaved).

```ts
interface Todo {
  id: number;              // INTEGER PK AUTOINCREMENT (0 = unsaved)
  title: string;           // ≤200 chars (enforced at UI/validation)
  description: string | null;
  deadline: string | null; // ISO 8601, LOCAL-no-Z: `${date}T${time}` (see invariant below)
  isCompleted: boolean;    // 0|1 in DB
  order: number;           // position; lower = higher in the list
  createdAt: string;       // ISO 8601
  completedAt: string | null; // set when isCompleted → true
}
```

Schema (`src/data/DatabaseService.ts`, DB name `vito_todos`, idempotent DDL):

```sql
CREATE TABLE IF NOT EXISTS Todos (
  Id          INTEGER PRIMARY KEY AUTOINCREMENT,
  Title       TEXT    NOT NULL,
  Description TEXT,
  Deadline    TEXT,
  IsCompleted INTEGER NOT NULL DEFAULT 0,
  "Order"     INTEGER NOT NULL DEFAULT 0,   -- "Order" is a SQL reserved word: ALWAYS quote it
  CreatedAt   TEXT    NOT NULL,
  CompletedAt TEXT
);
```

- Table/column names are **PascalCase** in SQL; TS vars/fns are **camelCase**.
- `"Order"` MUST be quoted in every statement (reserved word).
- DB name `vito_todos` is **load-bearing**: the Kotlin widget opens the same file
  by name (`getDatabasePath`), so it must stay stable.

### Deadline storage invariant (load-bearing — do not break)

Deadlines are stored **local time, no `Z` suffix** (`` `${date}T${time}` ``), NOT
`toISOString()` UTC. The widget's "time == 00:00 → show day only" branch
(`isTimeZero`) depends on this. If export/storage ever switches to UTC
`toISOString()`, the widget's day/time rendering skews. Keep deadline formatting
local-no-Z across the TS layer and the widget.

## 4. Widget (native Kotlin, Option W2)

`android/app/src/main/java/app/servimus/vitotodolist/widget/`:
- `TodoWidgetProvider.kt` — `AppWidgetProvider`; renders `R.layout.todo_widget`,
  wires the collection adapter + tap-to-open PendingIntent.
- `TodoWidgetService.kt` / `TodoWidgetFactory.kt` — `RemoteViewsService` +
  `RemoteViewsFactory`; opens the shared `vito_todos` SQLite file directly and
  renders each row (`R.layout.todo_widget_item`), with Hungarian deadline
  formatting and strikethrough for completed items.
- Layouts under `android/app/src/main/res/{layout,xml}/todo_widget*`.

The widget reads the SAME on-device SQLite file the app writes (plan §6 Option W2),
so there is no separate widget data store. Refresh: `MainActivity.onPause` calls
`TodoWidgetProvider.updateAllWidgets()` (in-process; no broadcast), so the widget
re-reads the DB whenever the app leaves the foreground; plus the ~30-min widget
cadence. Tapping the background, the empty view, or an item opens the app.

## 5. Export / import (`src/services/ExportImportService.ts`)

- JSON export of all todos; downloaded via browser native APIs (`Blob`, `URL.createObjectURL`, anchor click).
- Import is **tolerant**: accepts both PascalCase (MAUI export) and camelCase keys,
  reverses the field semantics per the §12 contract, and re-inserts (IDs reassigned).
- The export/import uses native browser APIs (no Capacitor plugins), so the JSON
  round-trip is covered by the Vitest suite
  (`tests/services/ExportImportService.test.ts`).

## 6. Testing & gates

- **Unit/integration:** Vitest, `globals: false` — import `{ describe, it, expect,
  vi }` from `"vitest"` explicitly. Fresh in-memory DB per test; Capacitor plugins
  mocked via alias (`vitest.config.ts` → `src/__mocks__/`). `better-sqlite3` is a
  DEV-ONLY test driver — never imported by app code.
- **Gate (DoD parity):** `npx tsc --noEmit` clean + `npm run build` ok +
  `npm run test` exit 0. New behaviour → new test.
- **On-device behavioural:** `.maestro/` — a reproducible Maestro launch/screenshot
  flow (`.maestro/smoke.yaml`) plus a CDP-DOM + TypeSafe-Jev behavioural harness
  (`.maestro/smoke/`). Run both with `.maestro/smoke/run.sh`. The WebView DOM is
  absent from the Android a11y tree, so Maestro is the launch/visual harness and the
  CDP+Jev harness owns the deterministic behavioural assertions. See
  `.maestro/smoke/README.md`.

## 7. Project structure

```
src/
  App.tsx                 wires executor (device vs web), providers, routes
  main.tsx
  models/Todo.ts          model + createTodo factory
  data/
    SqliteExecutor.ts     async DB interface (device + web/test impls)
    DatabaseService.ts    DDL, DB_NAME="vito_todos", clearAll
    TodoRepository.ts     all SQL (MAUI ordering parity), executor-first
  services/ExportImportService.ts
  hooks/
    useTodos.ts           list state + mutations
    useEditTodo.ts        edit-screen state
  components/
      TodoListPage.tsx      list + Dnd + export/import in header
      TodoEditPage.tsx      add/edit form
    TodoRow.tsx           row (checkbox, title, drag handle)
    SortableTodoRow.tsx   @dnd-kit sortable wrapper
    SwipeToDelete.tsx     hand-rolled left-anchored swipe-delete + confirm
  __mocks__/              Capacitor plugin mocks for tests
android/                  Capacitor Android project (self-contained) + Kotlin widget
.maestro/                 on-device smoke/regression suite (Maestro + CDP+Jev)
docs/                     this file, the rework plan, handoff
tests/                    Vitest suites (mirror src/ layers)
```

## 8. Conventions

- Executor-first repo functions; inject the DB, never import a singleton.
- Prepared-statement binds, explicit columns (no `SELECT *`); quote `"Order"`.
- Models: interface + explicit-default factory.
- Vitest: no globals, fresh in-memory DB per test, Capacitor mocked.
- Naming: SQL PascalCase; TS camelCase vars/fns, PascalCase types, UPPER_SNAKE const.
- Styling: inline React `CSSProperties`, yellow theme (`YELLOW_*` in `TodoRow.tsx`),
  no CSS framework.
- Git: Conventional Commits; never force-push/amend-published/`--no-verify`.
