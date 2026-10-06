#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# VitoTodoList — one-command reproducible on-device smoke / regression run.
#
# Two layers, run in order:
#   1. Maestro flow (.maestro/smoke.yaml): clean-state launch + OS-perm dismissal
#      + labelled screenshots (visual regression evidence). Capacitor WebView DOM
#      is invisible to Maestro, so this is the launch harness + screenshots only.
#   2. CDP + TypeSafe Jev harness (harness.py): the DETERMINISTIC behavioral
#      assertions (add / toggle-strikethrough / reorder-persist / delete / share).
#
# Usage:
#   .maestro/smoke/run.sh                 # full regression: Maestro + all scenarios
#   .maestro/smoke/run.sh --no-maestro    # behavioral harness only (faster)
#   .maestro/smoke/run.sh --only S1,S4    # subset of behavioral scenarios
#   .maestro/smoke/run.sh --rebuild       # rebuild+reinstall the debug APK first
#   PASS-THROUGH: any extra args go to harness.py (e.g. --no-vitest).
#
# Requires: a booted AVD, a debug APK of the current branch, TYPESAFE_API_KEY in
# ~/.hermes/.env (or the env), and `pip install pyyaml websockets`. Maestro at
# ~/.maestro/bin/maestro. Exit code 0 iff Maestro passed AND every non-skipped
# behavioral scenario PASSED.
# ---------------------------------------------------------------------------
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/../smoke_out"
MAESTRO_OUT="$OUT/maestro"
MAESTRO_FLOW="$REPO/.maestro/smoke.yaml"

# shellcheck disable=SC1090
source "$HERE/android-env.sh"
set -a; . ~/.hermes/.env 2>/dev/null || true; set +a

RUN_MAESTRO=1
PASSTHRU=()
for a in ${@+"$@"}; do
  case "$a" in
    --no-maestro) RUN_MAESTRO=0 ;;
    *) PASSTHRU+=("$a") ;;
  esac
done

mkdir -p "$MAESTRO_OUT"

# --- Preflight: a booted device/emulator must be present ---------------------
if [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != "1" ]; then
  echo "ABORT: no booted emulator/device (adb sys.boot_completed != 1)." >&2
  echo "  Boot one: emulator -avd <avd> -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect &" >&2
  echo "  AVDs: $(emulator -list-avds 2>/dev/null | tr '\n' ' ')" >&2
  exit 2
fi

maestro_rc=0
if [ "$RUN_MAESTRO" = "1" ]; then
  if command -v maestro >/dev/null 2>&1; then
    echo "=== [1/2] Maestro launch + visual capture ($MAESTRO_FLOW) ==="
    # Maestro writes screenshots into its run dir; capture that dir and copy out.
    maestro test "$MAESTRO_FLOW" 2>&1 | tee "$MAESTRO_OUT/maestro_run.log"
    maestro_rc=${PIPESTATUS[0]}
    # Maestro 2.11 writes screenshots under ~/.maestro/tests/<ts>/<flow>/takeScreenshot/.
    # Grab the newest run dir and copy its PNGs into smoke_out/maestro/.
    newest_run="$(ls -dt "$HOME"/.maestro/tests/*/ 2>/dev/null | head -1)"
    if [ -n "$newest_run" ]; then
      shots="$(find "$newest_run" -name '*.png' 2>/dev/null)"
      if [ -n "$shots" ]; then
        while IFS= read -r png; do
          [ -f "$png" ] && cp -f "$png" "$MAESTRO_OUT/" 2>/dev/null || true
        done <<< "$shots"
      fi
    fi
    # Fallback: some setups drop PNGs in CWD/repo root.
    shopt -s nullglob
    for png in "$REPO"/*.png "$HERE"/*.png ./*.png; do
      [ -f "$png" ] && mv -f "$png" "$MAESTRO_OUT/" 2>/dev/null || true
    done
    shopt -u nullglob
    echo "  Maestro exit=$maestro_rc; screenshots+log -> $MAESTRO_OUT/"
  else
    echo "WARN: maestro not on PATH (~/.maestro/bin). Skipping Maestro layer." >&2
    echo "  Install: curl -Ls https://get.maestro.mobile.dev | bash" >&2
  fi
else
  echo "=== [1/2] Maestro layer skipped (--no-maestro) ==="
fi

echo ""
echo "=== [2/2] CDP + Jev behavioral harness ==="
python3 "$HERE/harness.py" --fresh ${PASSTHRU[@]+"${PASSTHRU[@]}"}
harness_rc=$?

echo ""
echo "=== Regression summary ==="
echo "  Maestro:  $([ "$RUN_MAESTRO" = 1 ] && echo "exit=$maestro_rc" || echo "skipped")"
echo "  Harness:  exit=$harness_rc"
echo "  Report:   $OUT/report.json"
echo "  DOM dumps + screenshots: $OUT/"

# Fail if either layer failed (Maestro only counts when it actually ran).
rc=0
[ "$RUN_MAESTRO" = "1" ] && [ "$maestro_rc" -ne 0 ] && rc=1
[ "$harness_rc" -ne 0 ] && rc=1
exit $rc
