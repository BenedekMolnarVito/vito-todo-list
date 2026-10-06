# VitoTodoList — AI Coding Agent Instructions

> React 18 + TypeScript 5 + Vite 7 todo-list app for **Android via Capacitor 8**,
> on-device SQLite shared with a native Kotlin home-screen widget. Reworked from a
> former .NET MAUI app (removed; see git history). Android-only.

## Toolchain (NOT dotnet)

```
npx tsc --noEmit    # typecheck = de-facto lint (NO separate lint command)
npm run build       # vite build
npm run test        # vitest run — baseline gate
npm run test:watch  # vitest watch (TDD red→green)
npm run dev         # vite dev server (web preview)
npm run cap:sync    # copy existing web build → android project (build first)
npm run android:run # macOS zsh/bash ONLY: build → sync → ./gradlew installDebug
```

**Gate (all must pass before merge):** `npx tsc --noEmit` clean + `npm run build` ok
+ `npm run test` exit 0. New behaviour → new test.

Development machines include Windows 11 and macOS. Provide both command dialects
with explicit OS/shell labels; do not assume the current host is a Mac. See
README.md for setup. Windows PowerShell install command:
`cmd /c "npm run build && npx cap sync android && cd android && gradlew.bat installDebug"`.
Use `npm install --legacy-peer-deps` (plain install previously crashed on macOS).
Windows JDK 21 setup uses `$env:JAVA_HOME`; Apple Silicon macOS Homebrew setup uses
`export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`.
`@capacitor-community/sqlite` is pinned `^8.1.1` (6.x needs Capacitor Core 6).

## Architecture (strict layer duty)

```
React components (src/components/)   stateless render + local gesture state only
  ↓  props/callbacks
React hooks (src/hooks/)             useTodos / useEditTodo own screen state + orchestration
  ↓  injected deps (executor, share, confirm)
Services (src/services/)             ExportImportService (tolerant JSON import, §12 contract)
Repository (src/data/TodoRepository) ALL SQL; MAUI ordering parity; executor-first functions
  ↓
SqliteExecutor (src/data/)           async DB interface — device (@capacitor-community/sqlite)
                                     vs web/test (in-memory / better-sqlite3, DEV-ONLY)
  ↓
SQLite "vito_todos"                  shared file; native Kotlin widget reads the same DB
```

Routes: `/` → list (`TodoListPage`), `/edit/:id` and `/add` → `TodoEditPage`.

## Key conventions (full detail → docs/ARCHITECTURE.md)

- **Executor-first repo fns:** `SqliteExecutor` is the FIRST argument; inject it, never
  import a singleton DB. `App.tsx` picks the device vs web executor behind
  `Capacitor.isNativePlatform()`.
- **Hooks own state, components are dumb.** Hooks receive the executor, the share fn,
  and a `confirm` fn as injected deps (swappable in tests).
- **SQL:** prepared-statement `?` binds, explicit columns (no `SELECT *`). `"Order"` is
  a reserved word — ALWAYS quote it.
- **Model:** `src/models/Todo.ts` = interface + `createTodo()` factory (all defaults
  explicit, `id=0` = unsaved).
- **Tests:** Vitest `globals: false` — import `{ describe, it, expect, vi }` from
  `"vitest"` explicitly. Fresh in-memory DB per test. Capacitor plugins mocked via
  alias (`vitest.config.ts` → `src/__mocks__/`). `better-sqlite3` is DEV-ONLY — never
  import it in app code.
- **Naming:** SQL table/col PascalCase; TS var/fn camelCase; interface/type PascalCase;
  const UPPER_SNAKE.
- **Styling:** inline React `CSSProperties`, yellow theme (`YELLOW_*` in `TodoRow.tsx`),
  no CSS framework.

## Load-bearing invariants (do NOT break)

1. **DB name `vito_todos`** (`DatabaseService.DB_NAME`) is opened by the Kotlin widget
   by name — keep it stable.
2. **Deadlines stored local-no-Z** (`` `${date}T${time}` ``), NOT `toISOString()` UTC.
   The widget's "time == 00:00 → day only" (`isTimeZero`) branch depends on it; UTC
   would skew the widget. Keep deadline formatting local across the TS layer + widget.

## Widget (native Kotlin, Option W2)

`android/app/src/main/java/app/servimus/vitotodolist/widget/` (Provider/Service/
Factory `.kt`) + `android/app/src/main/res/{layout,xml}/todo_widget*`. Reads the shared
`vito_todos` SQLite directly (RemoteViews collection), tap-to-open, Hungarian deadline
formatting, strikethrough for completed. Refresh on the ~30-min widget cadence; a
`updateAllWidgets()` helper exists but the TS→widget push bridge is not wired.

## Swipe-delete note

`SwipeToDelete.tsx` is **hand-rolled** (left-anchored red Delete, revealed by a
rightward swipe, `window.confirm`). `react-swipeable-list` was planned but needs
`prop-types` (absent), so this is a drop-in replacement with the same boundary (plan
§9 Q4). Per the android-webview-jev-testing skill, adb `input swipe` does NOT reliably
trigger React pointer handlers — smoke tests drive delete via the revealed button's DOM
`.click()`, not a synthetic swipe.

## Testing evidence

Real tool output only: `npm run test`, `npm run build`, `npx tsc --noEmit`, OR the
on-device smoke harness (`.maestro/smoke/` — CDP+Jev DOM dumps in
`smoke_out/*.json` + `report.json`, plus the Maestro flow `.maestro/smoke.yaml`). A
Capacitor WebView's DOM is NOT in the Android a11y tree, so Maestro is the launch/
screenshot harness and CDP+Jev owns behavioural assertions. Never fabricate on-device
results — a partial run with honest blockers beats a fabricated green.

## Spec sources

- `docs/ARCHITECTURE.md` — layers, schema, widget, conventions (read for architecture).
- `docs/REWORK_PLAN_react-capacitor.md` — full plan (§2 stack, §3 structure, §4 data,
  §6 widget, §7 tests, §9 resolved questions, §12 export/import contract).
- `README.md` — feature overview + install/test/build + schema.

## Anti-patterns

- Gold-plating (build beyond spec); assumption coding (guess requirements); silent
  scope creep (refactor unrelated during a fix); skipping tests; cargo-cult boilerplate.
