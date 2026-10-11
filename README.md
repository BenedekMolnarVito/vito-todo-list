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
- **Home-screen widget** (native Kotlin, RemoteViews) showing a scrollable todo list,
  tap-to-open, reading the same SQLite file the app writes.

## Tech stack

- React 18 + TypeScript 5, Vite 7
- Capacitor 8 (Android)
- `@capacitor-community/sqlite` (on-device SQLite)
- `@dnd-kit` (reorder), `@capacitor-community/sqlite` (on-device SQLite), `@capacitor/app` (lifecycle)
- Vitest + Testing Library (tests)
- Native Kotlin widget (RemoteViews)

## Prerequisites

- Node.js + npm
- JDK 21 and the Android SDK (platform-tools, emulator, a system image)
- An Android emulator or device

Development is supported from Windows 11 and macOS. Run commands from the
repository root unless stated otherwise. The shell-specific examples below are
labelled explicitly; do not use macOS paths on Windows.

Use `npm install --legacy-peer-deps`: plain `npm install` previously crashed under
the macOS npm/arborist setup. This install command is also usable on Windows.

### Windows 11 — PowerShell

Install JDK 21 and the Android SDK (for example, via Android Studio). If Java is
not already configured, set these for the current PowerShell session, replacing
the placeholder with your actual JDK 21 installation directory:

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-21'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
```

Set the SDK **root** to match Android Studio's SDK Location, not the
`cmdline-tools\latest\bin` directory. For the default Windows SDK location:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
```

If Windows user/system environment variables already contain an incorrect SDK
path, correct them in **Edit environment variables for your account** and restart
your terminal/VS Code. `ANDROID_SDK_ROOT` is deprecated; if retained, it must match
`ANDROID_HOME`.

Alternatively, set `sdk.dir=C:/Users/<your-user>/AppData/Local/Android/Sdk` in
`android/local.properties`. This file is Git-ignored and machine-specific; never
commit it. On macOS, use your Mac's actual SDK root instead. A licence/missing-SDK
error naming a different SDK path than Android Studio usually means the build is
using the wrong SDK, not that the installed packages are missing.

### macOS — zsh / bash

For the Homebrew JDK 21 setup:

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
java -version
```

This path is for Apple Silicon Homebrew; use your installed JDK's path if different.

## Install & run

These npm commands work on **both Windows PowerShell and macOS zsh/bash**:

```sh
npm install --legacy-peer-deps     # install deps (see note above)
npm run dev                        # Vite dev server (web preview)
npm run build                      # production web build (dist/)
npm run cap:sync                   # sync an existing web build into Android
```

`cap:sync` does not build the web app; run `npm run build` first when web code changes.
Start an Android emulator or connect a device before installing the debug app.

### Windows 11 — PowerShell (also works in Command Prompt)

The existing `npm run android:run` script uses `./gradlew` and is macOS/POSIX-only.
On Windows, use `gradlew.bat` instead. The commands below explicitly invoke
`cmd.exe` so `&&` works even in Windows PowerShell 5.1, and stop on failure.

Build, sync, and install on a device/emulator:

```powershell
cmd /c "npm run build && npx cap sync android && cd android && gradlew.bat installDebug"
```

Build the debug APK without installing:

```powershell
cmd /c "npm run build && npx cap sync android && cd android && gradlew.bat assembleDebug"
```

### macOS — zsh / bash

Build, sync, and install on a device/emulator:

```sh
npm run android:run
```

Build the debug APK without installing:

```sh
npm run build && npx cap sync android && (cd android && ./gradlew assembleDebug)
```

Both OSes produce `android/app/build/outputs/apk/debug/app-debug.apk`.

## Tests & gate

The same commands apply to Windows PowerShell and macOS zsh/bash:

```sh
npx tsc --noEmit    # typecheck (de-facto lint — no separate linter)
npm run build       # vite build
npm run test        # vitest run
```

All three must pass before merge. New behaviour requires a new test.

### On-device smoke / regression

On-device smoke suite under `.maestro/` — **macOS bash**:

```sh
bash .maestro/smoke/run.sh         # Maestro launch+screenshots + CDP/Jev behavioural scenarios
```

This is a Bash harness, not a native PowerShell command. Windows execution is not
verified; do not assume Git Bash or WSL works without adapting the Android SDK,
Python, and Maestro setup described in the smoke README.

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
