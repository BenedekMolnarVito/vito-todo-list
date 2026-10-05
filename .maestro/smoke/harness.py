#!/usr/bin/env python3
"""
harness.py — deterministic behavioral smoke-test runner for VitoTodoList.

Adapted from treasury-scribe/.maestro/smoke/harness.py.

Design contract:
  * CODE owns the flow: fixed navigation + hard assertions (testids, url, js checks).
  * JEV (TypeSafe System One) is consulted ONLY for semantic yes/no assertions,
    ALL batched into ONE request per scenario. Never for planning or navigation.
  * Scenarios are declarative data in scenarios.yaml -> easy to extend/maintain.
  * Non-UI paths (export round-trips) shell out to vitest.
  * Deterministic + reproducible: same seed data, same steps, thresholds in code.

Usage:
    python3 harness.py                 # run all scenarios, write report
    python3 harness.py --fresh         # adb pm clear app state before run
    python3 harness.py --only S1,S4    # run a subset (id prefix match)
    python3 harness.py --no-vitest     # skip the shelled-out Node suites
    python3 harness.py --rebuild       # rebuild+reinstall APK first
    python3 harness.py --no-seed       # skip seeding (assume data present)

Exit code 0 iff every selected scenario PASSED.

ENV BOOTSTRAP (required):
    export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
    export ANDROID_HOME=$HOME/Library/Android/sdk
    export ANDROID_SDK_ROOT=$HOME/Library/Android/sdk
    export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
    set -a; . ~/.hermes/.env; set +a   # loads TYPESAFE_API_KEY
    test -n "$TYPESAFE_API_KEY" && echo keyok
"""
import argparse, json, os, subprocess, sys, time
import yaml
import cdp
import jev

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "..", "smoke_out")
SCENARIOS_FILE = os.path.join(HERE, "scenarios.yaml")
ENV_SH = os.path.join(HERE, "android-env.sh")
os.makedirs(OUT, exist_ok=True)


def log(msg):
    print(msg, flush=True)


# ---------------------------------------------------------------------------
# Navigation executor (deterministic)
# ---------------------------------------------------------------------------
def run_nav(steps, default_sleep):
    nav_state = {}
    for step in steps or []:
        if step == "launch":
            cdp.launch(); time.sleep(default_sleep)
        elif step == "dismiss_perms":
            for _ in range(3):
                cdp.press_key("KEYCODE_BACK"); time.sleep(1)
        elif isinstance(step, dict):
            (op, arg), = step.items()
            if op == "sleep":
                time.sleep(float(arg))
            elif op == "tap_text":
                cdp.tap_text(arg)
            elif op == "tap_testid":
                cdp.tap_testid(arg)
            elif op == "press_key":
                cdp.press_key(arg)
            elif op == "set_input":
                cdp.set_input(arg["field"], str(arg["value"]))
            elif op == "reveal_swipe":
                cdp.reveal_swipe_delete(int(arg))
            elif op == "reorder_hook":
                cdp.reorder_todos_via_hook(arg)
            elif op == "toggle_first_checkbox":
                cdp.eval_js(
                    "(()=>{const c=document.querySelector('[data-testid^=\"checkbox-\"]');"
                    "if(c){c.click();return true;}return false;})()"
                )
                time.sleep(float(arg) if isinstance(arg, (int, float)) else 1.0)
            elif op == "drive_delete_first":
                # Delete the FIRST row deterministically; record result in nav_state.
                first_id = cdp.eval_js(
                    "(()=>{const r=document.querySelector('[data-testid^=\"todo-row-\"]');"
                    "return r?parseInt(r.getAttribute('data-testid').replace('todo-row-',''),10):null;})()"
                )
                if first_id is not None:
                    nav_state["delete_result"] = cdp.drive_delete(int(first_id))
                    nav_state["deleted_id"] = int(first_id)
                time.sleep(float(arg) if isinstance(arg, (int, float)) else 0.5)
            elif op == "drive_reorder_first_to_third":
                ids = cdp.row_ids_in_order()
                if len(ids) >= 3:
                    nav_state["reorder_result"] = cdp.drive_reorder_dnd(ids[0], ids[2])
                time.sleep(float(arg) if isinstance(arg, (int, float)) else 0.5)
            elif op == "snapshot_order":
                nav_state[str(arg)] = cdp.row_ids_in_order()
            elif op == "reload_app":
                # Full persistence check: kill + relaunch so the list re-reads SQLite.
                cdp.kill_app(); time.sleep(1.5)
                cdp.launch(); time.sleep(float(arg) if isinstance(arg, (int, float)) else 3.0)
            else:
                raise ValueError(f"unknown nav op: {op}")
        else:
            raise ValueError(f"unknown nav step: {step!r}")
    return nav_state


# ---------------------------------------------------------------------------
# Hard code assertions (no model)
# ---------------------------------------------------------------------------
def run_code_asserts(spec, dom, nav_state=None):
    """Return (ok: bool, failures: list[str])."""
    nav_state = nav_state or {}
    fails = []
    if not spec:
        return True, fails
    url = dom["url"]
    texts = {e["text"] for e in dom["els"] if e["text"]}
    if "url_endswith" in spec and not url.rstrip("/").endswith(spec["url_endswith"].rstrip("/")):
        fails.append(f"url {url!r} !endswith {spec['url_endswith']!r}")
    if "url_contains" in spec and spec["url_contains"] not in url:
        fails.append(f"url {url!r} !contains {spec['url_contains']!r}")
    for t in spec.get("testid_present", []):
        if not cdp.eval_js("(()=>!!document.querySelector('[data-testid=\"' + %s + '\"]'))()" % json.dumps(t)):
            fails.append(f"testid missing: {t}")
    for t in spec.get("testid_absent", []):
        if cdp.eval_js("(()=>!!document.querySelector('[data-testid=\"' + %s + '\"]'))()" % json.dumps(t)):
            fails.append(f"testid should be absent: {t}")
    for t in spec.get("text_present", []):
        if not any(t == x or t in x for x in texts):
            fails.append(f"text missing: {t!r}")
    if "min_interactive" in spec:
        n = sum(1 for e in dom["els"] if e["kind"] == "interactive")
        if n < spec["min_interactive"]:
            fails.append(f"interactive {n} < {spec['min_interactive']}")
    if "js" in spec:
        got = cdp.eval_js(spec["js"]["expr"])
        want = spec["js"]["equals"]
        if got != want:
            fails.append(f"js assert got {got!r} != {want!r}")
    # computed_style: assert a CSS computed property on an element matched by a JS expr.
    #   computed_style: {el: "<js expr -> element|null>", prop: "text-decoration-line",
    #                    contains: "line-through"}  (or equals: "...")
    for cs in (spec.get("computed_style") or ([spec["computed_style"]] if isinstance(spec.get("computed_style"), dict) else [])):
        if not isinstance(cs, dict):
            continue
        val = cdp.computed_style(cs["el"], cs["prop"])
        if val == "__noel__":
            fails.append(f"computed_style: no element for {cs['el']!r}")
        elif "contains" in cs and cs["contains"] not in (val or ""):
            fails.append(f"computed_style {cs['prop']}={val!r} !contains {cs['contains']!r}")
        elif "equals" in cs and (val or "").strip() != cs["equals"]:
            fails.append(f"computed_style {cs['prop']}={val!r} != {cs['equals']!r}")
    # nav_assert: assert on values the nav executor captured (delete/reorder/snapshots).
    #   nav_assert: {key: "delete_result.row_gone", equals: true}
    #            or {key: "order_before", not_equals_key: "order_after"}  (order changed)
    #            or {key: "order_after", equals_key: "order_persisted"}   (order persisted)
    for na in (spec.get("nav_assert") or []):
        def _resolve(path):
            cur = nav_state
            for part in path.split("."):
                if isinstance(cur, dict):
                    cur = cur.get(part)
                else:
                    return None
            return cur
        got = _resolve(na["key"])
        if "equals" in na and got != na["equals"]:
            fails.append(f"nav_assert {na['key']}={got!r} != {na['equals']!r}")
        if "equals_key" in na:
            other = _resolve(na["equals_key"])
            if got != other:
                fails.append(f"nav_assert {na['key']}={got!r} != {na['equals_key']}={other!r}")
        if "not_equals_key" in na:
            other = _resolve(na["not_equals_key"])
            if got == other:
                fails.append(f"nav_assert {na['key']}={got!r} == {na['not_equals_key']}={other!r} (expected change)")
        if "truthy" in na and bool(got) != bool(na["truthy"]):
            fails.append(f"nav_assert {na['key']}={got!r} truthy!={na['truthy']}")
    return (not fails), fails


# ---------------------------------------------------------------------------
# Seeding — add todos via the app's own Add screen over CDP
# ---------------------------------------------------------------------------
def seed_todo(title: str) -> bool:
    """Add one todo via the Add screen. Returns True if the save succeeded."""
    # Navigate to add screen
    if not cdp.tap_testid("add-button"):
        log(f"  seed: could not tap add-button for todo '{title}'")
        return False
    time.sleep(1.5)
    # Fill title
    if not cdp.set_input("title-input", title):
        cdp.press_key("KEYCODE_BACK")
        log(f"  seed: could not set title-input for todo '{title}'")
        return False
    time.sleep(0.5)
    # Save
    if not cdp.tap_testid("save-button"):
        log(f"  seed: could not tap save-button for todo '{title}'")
        return False
    time.sleep(1.5)
    # Verify we're back on the list page
    dom = cdp.extract_dom()
    if not cdp.eval_js("(()=>!!document.querySelector('[data-testid=\"todo-list-page\"]'))()"):
        log(f"  seed: did not return to list page after adding '{title}'")
        return False
    return True


def seed_all(seed_spec):
    log("  seeding todos via Add screen...")
    todos = seed_spec.get("todos", [])
    n = 0
    for t in todos:
        if seed_todo(t["title"]):
            n += 1
            log(f"    added: {t['title']}")
        else:
            log(f"    FAILED: {t['title']}")
    log(f"  seeded {n}/{len(todos)} todos")
    return n


# ---------------------------------------------------------------------------
# vitest shell-out for non-UI paths
# ---------------------------------------------------------------------------
def run_vitest(files):
    """Run the Node test suite for paths the emulator UI can't drive."""
    cmd = f'[ -f "{ENV_SH}" ] && source "{ENV_SH}"; npx vitest run ' + " ".join(files)
    r = subprocess.run(["bash", "-c", cmd], cwd=REPO, capture_output=True, text=True)
    tail = (r.stdout + r.stderr).strip().splitlines()[-15:]
    passed = r.returncode == 0
    return passed, "\n".join(tail)


# ---------------------------------------------------------------------------
# APK rebuild
# ---------------------------------------------------------------------------
def rebuild_apk():
    log("  rebuilding APK (npm build -> cap sync -> gradle assembleDebug)...")
    cmd = (
        f'source "{ENV_SH}"; cd "{REPO}" && '
        "npm run build --legacy-peer-deps >/dev/null 2>&1 && "
        "npx cap sync android >/dev/null 2>&1 && "
        "(cd android && ./gradlew assembleDebug) >/dev/null 2>&1 && "
        "adb install -r -g android/app/build/outputs/apk/debug/app-debug.apk"
    )
    r = subprocess.run(["bash", "-c", cmd], capture_output=True, text=True)
    ok = "Success" in r.stdout or r.returncode == 0
    log("  rebuild " + ("OK" if ok else "FAILED:\n" + r.stdout[-500:] + r.stderr[-500:]))
    return ok


# ---------------------------------------------------------------------------
# Scenario executor
# ---------------------------------------------------------------------------
def run_ui_scenario(sc, threshold, default_sleep, key):
    nav_state = run_nav(sc.get("nav"), default_sleep)
    dom = cdp.extract_dom()
    # Dump DOM for post-hoc inspection
    dump_path = os.path.join(OUT, f"{sc['id']}_dom.json")
    with open(dump_path, "w") as f:
        json.dump(dom, f, indent=2)
    log(f"  DOM dumped: {dump_path} ({dom['count']} elements)")

    code_ok, code_fails = run_code_asserts(sc.get("code_assert"), dom, nav_state)
    jev_results, jev_fails = {}, []
    asserts = sc.get("jev_assert") or []
    if asserts:
        state = {
            "screen": {
                "title": dom["title"],
                "url": dom["url"],
                "elements": [
                    {"kind": e["kind"], "text": e["text"], "testid": e.get("testid")}
                    for e in dom["els"]
                ],
            }
        }
        nouls = jev.batch_nouls(state, asserts, key)
        for a in asserts:
            v = nouls.get(a["id"], 0.0)
            jev_results[a["id"]] = v
            if v < threshold:
                jev_fails.append(f"{a['id']}={v:.2f}<{threshold}")
    # JEV is ADVISORY by default: the deterministic code_asserts are the gate.
    # A scenario may opt JEV into the gate with `jev_gating: true`.
    jev_gates = bool(sc.get("jev_gating", False))
    verdict = "PASS" if (code_ok and (not jev_gates or not jev_fails)) else "FAIL"
    # Serialize nav_state (only JSON-friendly bits) for the report evidence.
    nav_evidence = {k: v for k, v in (nav_state or {}).items()
                    if isinstance(v, (dict, list, str, int, float, bool, type(None)))}
    return {
        "id": sc["id"], "feature": sc.get("feature", ""), "kind": "ui",
        "verdict": verdict, "url": dom["url"],
        "code_fails": code_fails, "jev": jev_results, "jev_fails": jev_fails,
        "jev_gating": jev_gates, "nav_evidence": nav_evidence,
        "dom_dump": dump_path,
    }


def run_vitest_scenario(sc):
    passed, tail = run_vitest(sc["vitest_files"])
    return {
        "id": sc["id"], "feature": sc.get("feature", ""), "kind": "vitest",
        "verdict": "PASS" if passed else "FAIL",
        "vitest_files": sc["vitest_files"], "output_tail": tail,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="VitoTodoList behavioral smoke-test harness")
    ap.add_argument("--fresh", action="store_true", help="adb pm clear app state before run")
    ap.add_argument("--only", default="", help="comma-separated id prefixes to run")
    ap.add_argument("--no-vitest", action="store_true", help="skip Node vitest suites")
    ap.add_argument("--no-seed", action="store_true", help="skip seeding (assume data present)")
    ap.add_argument("--rebuild", action="store_true", help="rebuild+reinstall APK first")
    args = ap.parse_args()

    spec = yaml.safe_load(open(SCENARIOS_FILE))
    settings = spec.get("settings", {})
    threshold = float(settings.get("jev_pass_threshold", 0.8))
    default_sleep = float(settings.get("default_sleep", 1.5))

    only = [p.strip() for p in args.only.split(",") if p.strip()]

    def selected(sc):
        return (not only) or any(sc["id"].startswith(p) or sc["id"] == p for p in only)

    scenarios = [s for s in spec["scenarios"] if selected(s)]
    ui_scenarios = [s for s in scenarios if s.get("kind") != "vitest"]
    vitest_scenarios = [s for s in scenarios if s.get("kind") == "vitest"]

    if args.rebuild:
        if not rebuild_apk():
            log("ABORT: APK rebuild failed"); return 2

    key = None
    if ui_scenarios:
        if not cdp.device_online():
            log("ABORT: no booted emulator/device (adb sys.boot_completed != 1)")
            return 2
        key = jev.load_key()
        if len(key) < 20:
            log("ABORT: TYPESAFE_API_KEY not loaded (len < 20)")
            log("  Source it: set -a; . ~/.hermes/.env; set +a")
            return 2
        log(f"  JEV key loaded (len={len(key)})")

        if args.fresh:
            log(f"  clearing app state (adb pm clear {cdp.APP_ID})...")
            cdp.adb(f"adb shell pm clear {cdp.APP_ID} >/dev/null 2>&1")

        cdp.launch(); time.sleep(default_sleep)
        # Dismiss any permission/overlay screens
        for _ in range(3):
            cdp.press_key("KEYCODE_BACK"); time.sleep(0.8)
        cdp.launch(); time.sleep(3)

        if not args.no_seed:
            seed_all(spec.get("seed", {}))

    results = []
    for sc in scenarios:
        log(f"\n=== {sc['id']} — {sc.get('feature', '')} ===")
        try:
            if sc.get("kind") == "vitest":
                if args.no_vitest:
                    r = {
                        "id": sc["id"], "feature": sc.get("feature", ""), "kind": "vitest",
                        "verdict": "SKIPPED", "vitest_files": sc["vitest_files"],
                    }
                else:
                    r = run_vitest_scenario(sc)
            else:
                r = run_ui_scenario(sc, threshold, default_sleep, key)
        except Exception as e:
            r = {"id": sc["id"], "feature": sc.get("feature", ""), "verdict": "ERROR", "error": repr(e)}

        results.append(r)
        extra = ""
        if r.get("code_fails"): extra += f" code_fails={r['code_fails']}"
        if r.get("jev_fails"): extra += f" jev_fails={r['jev_fails']}"
        if r.get("error"): extra += f" error={r['error']}"
        log(f"[{r['verdict']:7}] {sc['id']}{extra}")

    report_path = os.path.join(OUT, "report.json")
    with open(report_path, "w") as f:
        json.dump(results, f, indent=2)

    npass = sum(1 for r in results if r["verdict"] == "PASS")
    nrun = sum(1 for r in results if r["verdict"] in ("PASS", "FAIL", "ERROR"))
    log(f"\n{npass}/{nrun} scenarios PASSED")
    for r in results:
        log(f"  {r['verdict']:7} {r['id']}  {r.get('feature', '')}")
    log(f"\nReport: {report_path}")
    return 0 if npass == nrun else 1


if __name__ == "__main__":
    raise SystemExit(main())
