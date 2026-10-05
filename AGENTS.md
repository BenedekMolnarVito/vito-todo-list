# AGENTS.md — VitoTodoList

> React 18 + TS 5 + Vite 7 todo app for Android via Capacitor 8. On-device SQLite
> (`@capacitor-community/sqlite`) shared with a native Kotlin home-screen widget.
> Reworked from a former .NET MAUI app (removed; see git history). Android-only.
> Full implementation detail → `.github/copilot-instructions.md`; architecture →
> `docs/ARCHITECTURE.md`.

## Toolchain (NOT dotnet)

```
npx tsc --noEmit    # typecheck = de-facto lint (no separate lint cmd)
npm run build       # vite build
npm run test        # vitest run — baseline gate
npm run cap:sync    # web build → android project
npm run android:run # build → cap sync → gradle installDebug (./gradlew, not .bat)
```

Gate = `npx tsc --noEmit` clean + `npm run build` ok + `npm run test` exit 0. New
behaviour → new test. On THIS Mac: `npm install --legacy-peer-deps` (plain install
crashes); JDK 21 via Homebrew (`JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/
openjdk.jdk/Contents/Home`); `@capacitor-community/sqlite` pinned `^8.1.1`.

## Architecture (strict layer duty)

```
components (src/components/)   stateless render + local gesture state
  ↓  props/callbacks
hooks (src/hooks/)             useTodos / useEditTodo own screen state + orchestration
  ↓  injected deps (executor, share, confirm)
services (src/services/)       ExportImportService (tolerant JSON import, §12 contract)
TodoRepository (src/data/)     ALL SQL; MAUI ordering parity; executor-first
  ↓
SqliteExecutor (src/data/)     device (@capacitor-community/sqlite) vs web/test (in-mem)
  ↓
SQLite "vito_todos"            shared file; Kotlin widget reads the same DB
```

Routes: `/` → list, `/edit/:id` + `/add` → edit.

## Key conventions

- Executor-first repo fns: inject `SqliteExecutor` (first arg), no singleton DB import.
  `App.tsx` chooses device vs web executor behind `Capacitor.isNativePlatform()`.
- Hooks own state; components dumb. Hooks take executor + share + confirm as deps.
- SQL: prepared `?` binds, explicit cols, quote `"Order"` (reserved word).
- Model src/models/Todo.ts = interface + `createTodo()` factory (defaults explicit).
- Vitest: `globals: false`, import fns from `"vitest"`; fresh in-memory DB per test;
  Capacitor mocked via `src/__mocks__/`; `better-sqlite3` DEV-ONLY (never in app code).
- Naming: SQL PascalCase; TS camelCase vars/fns, PascalCase types, UPPER_SNAKE const.
- Styling: inline React `CSSProperties`, yellow theme, no CSS framework.

## Load-bearing invariants (do NOT break)

1. DB name `vito_todos` (`DatabaseService.DB_NAME`) — the Kotlin widget opens it by
   name. Keep stable.
2. Deadlines stored local-no-Z (`` `${date}T${time}` ``), NOT `toISOString()` UTC —
   the widget's `isTimeZero` (00:00 → day-only) branch depends on it.

## Testing evidence (real output only)

`npm run test` / `npm run build` / `npx tsc --noEmit`, OR the on-device smoke harness
`.maestro/` (Maestro flow `.maestro/smoke.yaml` for launch+screenshots; CDP+Jev
behavioural harness `.maestro/smoke/`, run via `.maestro/smoke/run.sh`; evidence =
`smoke_out/report.json` + DOM dumps). A Capacitor WebView's DOM is NOT in the Android
a11y tree, so Maestro boots/launches and CDP+Jev asserts behaviour. NEVER fabricate
on-device results — honest blockers beat a fake green.

## Git

Branch `feat/<goal-slug>`. Conventional Commits (`feat(scope): imperative`). Never
force-push, never amend published, never `--no-verify`. No merge/push without consent.

## Anti-patterns

Gold-plating, assumption coding, silent scope creep (refactor during a fix), skipping
tests, cargo-cult boilerplate.
