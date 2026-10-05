# VitoTodoList — Android Todo List

A todo-list app for **Android**, built with **React 18 + TypeScript 5 + Vite 7**
and shipped as a native Android app via **Capacitor 8**. Todos persist in on-device
SQLite, which is shared with a native Kotlin home-screen widget.

> Reworked from the original .NET MAUI app. The MAUI sources were removed on the
> `feat/rework-react-capacitor` branch; see git history for the previous version.

## Features

- **CRUD** todos with title, optional description, optional deadline.
- **On-device SQLite** persistence (`@capacitor-community/sqlite`).
- **Completion tracking** — checkbox toggles strikethrough + records completion time.
- **Drag-reorder** the list (`@dnd-kit`, live reorder with autoscroll).
- **Swipe-to-delete** — left-anchored red Delete revealed by a rightward swipe, with
  a confirm dialog.
- **Export / Import** todos as JSON (tolerant import: accepts both the MAUI PascalCase
  export and camelCase).
- **Share** the exported JSON via any installed app (`@capacitor/share`).
- **Home-screen widget** (native Kotlin, RemoteViews) showing a scrollable todo list,
  tap-to-open, reading the same SQLite file the app writes.

## Tech stack

- React 18 + TypeScript 5, Vite 7
- Capacitor 8 (Android)
- `@capacitor-community/sqlite` (on-device SQLite)
- `@dnd-kit` (reorder), `@capacitor/share` + `@capacitor/filesystem` (export)
- Vitest + Testing Library (tests)
- Native Kotlin widget (RemoteViews)

## Prerequisites

- Node.js + npm
- JDK 21 and the Android SDK (platform-tools, emulator, a system image)
- An Android emulator or device

On this machine specifically:
- `npm install` crashes under the current npm/arborist — use
  `npm install --legacy-peer-deps`.
- No system Java; use the Homebrew JDK 21:
  `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`

## Install & run

```sh
npm install --legacy-peer-deps     # install deps (see note above)
npm run dev                        # Vite dev server (web preview)
npm run build                      # production web build (dist/)
npm run cap:sync                   # copy web build into the Android project
npm run android:run                # build → cap sync → gradle installDebug on a device/emulator
```

To build the Android debug APK directly:

```sh
npm run build && npx cap sync android && (cd android && ./gradlew assembleDebug)
# → android/app/build/outputs/apk/debug/app-debug.apk
```

(The npm `android:run` uses `./gradlew`, not the Windows `gradlew.bat`.)

## Tests & gate

```sh
npx tsc --noEmit    # typecheck (de-facto lint — no separate linter)
npm run build       # vite build
npm run test        # vitest run
```

All three must pass before merge. New behaviour requires a new test.

### On-device smoke / regression

Reproducible on-device smoke suite under `.maestro/`:

```sh
.maestro/smoke/run.sh              # Maestro launch+screenshots + CDP/Jev behavioural scenarios
```

See `.maestro/smoke/README.md` for the two-layer design (Maestro boots/launches and
captures screenshots; a CDP-DOM + TypeSafe-Jev harness runs the deterministic
behavioural assertions, because a Capacitor WebView's DOM is not in the Android
accessibility tree).

## Using the widget

1. Long-press the Android home screen → **Widgets**.
2. Find **VitoTodoList**, drag it to the home screen, resize as needed.
3. Tap the widget to open the app. The widget reads the same on-device database the
   app writes.

## Database schema

Table `Todos` in the `vito_todos` SQLite database (shared with the widget):

| Column        | Type    | Notes                                   |
|---------------|---------|-----------------------------------------|
| `Id`          | INTEGER | PK AUTOINCREMENT                        |
| `Title`       | TEXT    | NOT NULL, ≤200 chars                     |
| `Description` | TEXT    | nullable                                |
| `Deadline`    | TEXT    | nullable, ISO 8601 (local, no `Z`)      |
| `IsCompleted` | INTEGER | 0/1                                     |
| `"Order"`     | INTEGER | position (reserved word — always quoted)|
| `CreatedAt`   | TEXT    | ISO 8601                                |
| `CompletedAt` | TEXT    | nullable, ISO 8601                      |

## Documentation

- `docs/ARCHITECTURE.md` — layers, schema, widget, conventions.
- `docs/REWORK_PLAN_react-capacitor.md` — the full rework plan.
- `.github/copilot-instructions.md` — agent/implementation conventions.

## License

MIT.
