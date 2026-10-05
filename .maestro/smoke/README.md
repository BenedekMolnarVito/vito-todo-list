# VitoTodoList — on-device smoke / regression suite (`.maestro/`)

Deterministic, reproducible on-device smoke test for the Capacitor Android build.
**Two layers**, run together by one command:

1. **Maestro flow** — `.maestro/smoke.yaml`
   Clean-state launch, OS-permission dismissal, and labelled screenshots
   (visual regression evidence). VitoTodoList is a Capacitor **WebView**, whose
   DOM is *not* in the Android accessibility tree, so Maestro is the reproducible
   **launch + screenshot** harness only — it is **not** the behavioral oracle.

2. **CDP + TypeSafe Jev harness** — `.maestro/smoke/`
   The **deterministic behavioral assertions**. Code owns the flow and every hard
   assertion (over the real WebView DOM via Chrome DevTools Protocol); TypeSafe
   Jev supplies **advisory** semantic yes/no judgments, batched one request per
   screen. Jev does **not** gate (its distilled DOM is style-stripped and noisy on
   visual facts) unless a scenario sets `jev_gating: true`. Non-UI paths shell out
   to `vitest`.

## One-command regression

```sh
.maestro/smoke/run.sh                 # Maestro + all behavioral scenarios (--fresh)
.maestro/smoke/run.sh --no-maestro    # behavioral harness only (faster)
.maestro/smoke/run.sh --only S1,S4    # subset by id prefix
.maestro/smoke/run.sh --rebuild       # rebuild+reinstall the debug APK first
.maestro/smoke/run.sh --no-vitest     # skip the shelled-out Node suites
```

Exit code 0 iff Maestro passed **and** every non-skipped behavioral scenario PASSED.

### Prerequisites
- A booted AVD (e.g. `treasury_test`) and a **debug** APK of the current branch:
  `android/app/build/outputs/apk/debug/app-debug.apk` (the debug build exposes CDP).
  Boot headless:
  `emulator -avd <avd> -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect &`
- `TYPESAFE_API_KEY` in `~/.hermes/.env` (sourced automatically by `run.sh`; the
  harness also finds it via `~/.zshrc`). Only needed for the advisory Jev scores.
- `pip install pyyaml websockets`; Maestro at `~/.maestro/bin/maestro`.
- Toolchain env is in `android-env.sh` (JDK 21, Android SDK, PATH) — override any
  var in your shell. `run.sh` sources it.

## Files
- `smoke.yaml` (repo `.maestro/` root) — the **Maestro** launch + screenshot flow.
- `smoke/scenarios.yaml` — declarative behavioral scenarios (`nav` + `code_assert`
  + advisory `jev_assert`, or `kind: vitest`). **Edit this to add/maintain tests —
  no Python changes needed.** The header documents every nav op and assertion type.
- `smoke/harness.py` — runner: nav executor (incl. `drive_delete_first`,
  `drive_reorder_first_to_third`, `toggle_first_checkbox`, `snapshot_order`,
  `reload_app`), code-assert engine (incl. `computed_style`, `nav_assert`),
  batched-Jev caller, vitest shell-out, seeding, reporting.
- `smoke/cdp.py` — CDP DOM primitives (extract, tap, set_input, drive_delete,
  drive_reorder_dnd, computed_style, kill/launch, re-resolve WebView socket).
- `smoke/jev.py` — TypeSafe Jev client; `batch_nouls` = many assertions, one request.
- `smoke/android-env.sh` — adb/gradle/maestro toolchain env.
- `smoke/run.sh` — the one-command entrypoint (Maestro → harness).
- `smoke_out/` — per-run artifacts. `report.json` + `<id>_dom.json` are **committed**
  as proof of the on-device run; `maestro/*.png` + `*.log` are git-ignored (binary,
  regenerated each run).

## Scenarios (plan §7) — what each one DRIVES and how it is PROVEN
| id | drives | deterministic gate (code_assert) |
|----|--------|----------------------------------|
| S1 add | Add screen → fill title → save | new todo is the **first** row |
| S2 toggle | click first checkbox | completed row title has **computed `line-through`** |
| S3 reorder-persist | synthetic dnd drag¹ + **force-stop + relaunch** | order after reload **== order before reload** (SQLite persistence) |
| S4 delete | override `confirm`→true, click left `delete-<id>` | row **gone** + row count **drops by one** |
| S5 share | tap **Share** → Back | app alive, list page + rows still queryable |
| S5 vitest | — | export/import JSON round-trip (unit) |

¹ **Known limitation (honest):** `@dnd-kit` does not reliably respond to *synthetic*
pointer events over CDP, so the drag gesture itself may not move rows
(`reorder_result.changed` is recorded in the report and is often `false`). The
gate therefore proves the **persistence invariant** end-to-end (order survives a
real app restart that re-reads SQLite), not the gesture. Drag *logic* is covered by
`TodoRepository` unit tests (MAUI-ordering parity) and the Phase 4 source review.
To drive the gesture itself, expose a dev-only `window.__vitotodo_reorder(ids)` hook
in the app and switch S3's `nav` to `reorder_hook` (`cdp.reorder_todos_via_hook`).
