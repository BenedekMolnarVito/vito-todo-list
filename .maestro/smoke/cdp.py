#!/usr/bin/env python3
"""
cdp.py — deterministic CDP DOM primitives for the VitoTodoList WebView.

Adapted from treasury-scribe/.maestro/smoke/cdp.py.

Pure code, no model calls. Re-resolves the WebView devtools socket on every
call (the socket PID changes when the WebView respawns) and forwards it to a
local port. Exposes: extract_dom, eval_js, tap_text, tap_testid, set_input,
press_key, reveal_swipe_delete, launch, nav helpers.

CRITICAL GOTCHAS (android-webview-jev-testing skill):
  1. HOST CHROME HOLDS :9222 — desktop Chrome binds 127.0.0.1:9222 and you get
     its 404s, not the WebView. Forward to :9333. Check lsof -nP -iTCP:9222.
  2. WEBVIEW SOCKET PID CHANGES on respawn — re-resolve on EVERY call via
     adb shell cat /proc/net/unix | grep -oE 'webview_devtools_remote_[0-9]+'
  3. CDP /json may 404 (Host-header protection) but /json/list works.
  4. Debug APK already exposes CDP.
  5. adb input swipe does NOT trigger React pointer-drag handlers — use
     DOM click on the revealed delete button instead (SwipeToDelete.handleDeleteClick).

App package: app.servimus.vitotodolist
"""
import asyncio, json, os, subprocess, time
import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_SH = os.path.join(HERE, "android-env.sh")
APP_ID = os.environ.get("VITO_APP_ID", "app.servimus.vitotodolist")
MAIN_ACTIVITY = f"{APP_ID}/.MainActivity"
LOCAL_PORT = int(os.environ.get("VITO_CDP_PORT", "9333"))


def _adb(cmd: str) -> str:
    """Run an adb/shell command with the repo-local android env sourced."""
    src = f'[ -f "{ENV_SH}" ] && source "{ENV_SH}"; ' if os.path.exists(ENV_SH) else ""
    return subprocess.run(["bash", "-c", src + cmd], capture_output=True, text=True).stdout


def adb(cmd: str) -> str:
    return _adb(cmd)


def live_ws() -> str:
    """Re-resolve the current WebView CDP socket, forward it, return page WS url.

    GOTCHA: host Chrome holds :9222 — always forward to LOCAL_PORT (9333).
    GOTCHA: socket PID changes on WebView respawn — re-resolve every call.
    GOTCHA: /json may 404; use /json/list (works with forwarded socket).
    """
    _adb("adb forward --remove-all 2>/dev/null >/dev/null")
    sock = _adb(
        "adb shell cat /proc/net/unix | grep -oE 'webview_devtools_remote_[0-9]+' | head -1"
    ).strip()
    if not sock:
        raise RuntimeError(
            "No WebView devtools socket found. "
            "Is the app foregrounded and is this a debug build? "
            "(adb shell cat /proc/net/unix | grep webview)"
        )
    _adb(f"adb forward tcp:{LOCAL_PORT} localabstract:{sock} >/dev/null")
    listing = _adb(f"curl -s -m5 http://127.0.0.1:{LOCAL_PORT}/json/list")
    try:
        pages = [t for t in json.loads(listing) if t.get("type") == "page"]
    except json.JSONDecodeError:
        raise RuntimeError(f"CDP /json/list returned non-JSON: {listing[:200]!r}")
    if not pages:
        raise RuntimeError("No CDP page target found. Try restarting the app.")
    return pages[0]["webSocketDebuggerUrl"]


async def _eval(expr: str):
    async with websockets.connect(live_ws(), max_size=16 * 1024 * 1024) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
        await ws.recv()
        await ws.send(json.dumps({
            "id": 2,
            "method": "Runtime.evaluate",
            "params": {"expression": expr, "returnByValue": True, "awaitPromise": True},
        }))
        while True:
            m = json.loads(await ws.recv())
            if m.get("id") == 2:
                res = m.get("result", {})
                if res.get("exceptionDetails"):
                    raise RuntimeError(f"JS exception: {res['exceptionDetails']}")
                return res.get("result", {}).get("value")


def eval_js(expr: str):
    return asyncio.run(_eval(expr))


# ---------------------------------------------------------------------------
# Distilled DOM extraction — interactive els + leaf text + testids
# ---------------------------------------------------------------------------
DISTILL_JS = r"""
(() => {
  const out=[]; let idx=0;
  const vis=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&s.opacity!=='0';};
  const seen=new Set();
  document.querySelectorAll('a,button,input,select,textarea,[role=button],[role=tab],[role=link],[onclick],[tabindex]').forEach(el=>{
    if(!vis(el))return; const r=el.getBoundingClientRect();
    out.push({i:idx++,kind:'interactive',tag:el.tagName.toLowerCase(),role:el.getAttribute('role')||null,
      type:el.getAttribute('type')||null,testid:el.getAttribute('data-testid')||null,
      text:(el.innerText||el.value||el.getAttribute('aria-label')||el.getAttribute('placeholder')||'').trim().slice(0,80),
      box:[Math.round(r.x+r.width/2),Math.round(r.y+r.height/2)]});
    seen.add(el);});
  document.querySelectorAll('h1,h2,h3,h4,label,span,p,div').forEach(el=>{
    if(seen.has(el)||el.children.length>0||!vis(el))return;
    const t=(el.innerText||'').trim(); if(!t||t.length>80)return;
    out.push({i:idx++,kind:'text',tag:el.tagName.toLowerCase(),testid:el.getAttribute('data-testid')||null,text:t.slice(0,80)});});
  return JSON.stringify({title:document.title,url:location.href,count:out.length,els:out});
})()
"""


def extract_dom() -> dict:
    return json.loads(eval_js(DISTILL_JS))


def testids(dom: dict) -> list:
    return [e["testid"] for e in dom["els"] if e.get("testid")]


# ---------------------------------------------------------------------------
# Deterministic interactions
# ---------------------------------------------------------------------------
def tap_testid(testid: str) -> bool:
    js = (
        "(()=>{const el=document.querySelector('[data-testid=\"' + %s + '\"]');"
        "if(!el)return false;el.click();return true;})()" % json.dumps(testid)
    )
    return bool(eval_js(js))


def tap_text(text: str) -> bool:
    safe = json.dumps(text)
    js = (
        "(() => {const want=" + safe + ";"
        "const c=[...document.querySelectorAll('a,button,[role=button],[role=tab],span,div')]"
        ".filter(el=>el.getBoundingClientRect().width>0 && (el.innerText||'').trim()===want);"
        "if(!c.length) return false;"
        "c.sort((a,b)=>{const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();"
        "return ra.width*ra.height-rb.width*rb.height;});"
        "c[0].click(); return true;})()"
    )
    return bool(eval_js(js))


def set_input(placeholder_or_testid: str, value: str) -> bool:
    """Set a React-controlled input/textarea by placeholder, aria-label, or data-testid.
    Uses the native value setter + dispatched 'input' event so React state updates."""
    js = r"""
(() => {
  const key=%s, val=%s;
  const el=[...document.querySelectorAll('input,textarea')].find(e=>
    (e.placeholder||'').trim()===key || (e.getAttribute('aria-label')||'').trim()===key ||
    (e.getAttribute('data-testid')||'')===key);
  if(!el) return false;
  const proto = el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el, val);
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
})()""" % (json.dumps(placeholder_or_testid), json.dumps(value))
    return bool(eval_js(js))


def reveal_swipe_delete(todo_id: int) -> bool:
    """Programmatically reveal the LEFT-anchored delete button for a todo row.

    The SwipeToDelete component tracks a `revealed` React state. We can't drive
    a pointer-drag over CDP in a way that triggers React's onPointerMove/Up
    handlers reliably. Instead: directly dispatch a synthetic pointer sequence
    that makes the component snap to revealed, OR (safer) just set the delete
    button to be visible by clicking on it after making it visible.

    Strategy: fire a mousedown at the container's left edge, then simulate
    a rightward drag past SWIPE_THRESHOLD=80px, then mouseup — all as
    synthetic PointerEvents on the row wrapper element. The SwipeToDelete
    component listens to onPointerDown/Move/Up on the rowWrapper div.
    """
    js = """
(() => {
  const container = document.querySelector('[data-testid="swipe-container-%d"]');
  if (!container) return JSON.stringify({ok: false, reason: 'no container'});
  // The rowWrapper is the second child (delete button is first)
  const wrapper = container.children[1];
  if (!wrapper) return JSON.stringify({ok: false, reason: 'no wrapper'});
  const r = wrapper.getBoundingClientRect();
  const cx = r.left + 10;
  const cy = r.top + r.height / 2;
  // Fire synthetic pointer events to trigger the React handlers
  const makePtr = (type, x) => new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1,
    clientX: x, clientY: cy, buttons: 1
  });
  wrapper.dispatchEvent(makePtr('pointerdown', cx));
  wrapper.dispatchEvent(makePtr('pointermove', cx + 40));
  wrapper.dispatchEvent(makePtr('pointermove', cx + 85));
  wrapper.dispatchEvent(makePtr('pointerup', cx + 85));
  return JSON.stringify({ok: true});
})()
""" % todo_id
    result = eval_js(js)
    return json.loads(result).get("ok", False)


def click_delete_button(todo_id: int) -> bool:
    """Click the revealed LEFT-anchored delete button directly by data-testid.
    The button calls window.confirm(); this will block on real device.
    Use this AFTER reveal_swipe_delete() OR directly on device where confirm is auto-accepted.
    """
    return tap_testid(f"delete-{todo_id}")


def set_confirm(auto: bool) -> bool:
    """Override window.confirm so the deterministic driver can accept/reject the
    SwipeToDelete confirm() dialog WITHOUT a native blocking dialog on the WebView.

    SwipeToDelete.handleDeleteClick calls window.confirm(`Delete '<title>'?`).
    On the emulator WebView a native confirm() blocks CDP. We stub it to a pure
    JS function that returns the chosen value, so the real onDelete()->remove()
    path still runs. The feature under test is ROW REMOVAL, not the OS dialog.
    """
    js = "(()=>{ window.confirm = () => %s; return true; })()" % ("true" if auto else "false")
    return bool(eval_js(js))


def drive_delete(todo_id: int) -> dict:
    """Deterministically delete a todo via its LEFT-anchored delete button.

    Overrides window.confirm->true, clicks delete-<id>, waits for the React
    re-render, then reports whether the row is gone. No synthetic swipe is
    needed: the delete button is always in the DOM (hidden behind the row),
    and clicking it is the exact handler a user-revealed swipe would fire.
    Returns {clicked, row_gone, before_count, after_count}.
    """
    import time as _t
    before = eval_js(
        "(()=>document.querySelectorAll('[data-testid^=\"todo-row-\"]').length)()"
    )
    set_confirm(True)
    clicked = tap_testid(f"delete-{todo_id}")
    _t.sleep(1.2)
    row_gone = not bool(
        eval_js(
            "(()=>!!document.querySelector('[data-testid=\"todo-row-%d\"]'))()" % todo_id
        )
    )
    after = eval_js(
        "(()=>document.querySelectorAll('[data-testid^=\"todo-row-\"]').length)()"
    )
    return {"clicked": clicked, "row_gone": row_gone, "before_count": before, "after_count": after}


def row_titles_in_order() -> list:
    """Return todo titles in current DOM order (top -> bottom)."""
    js = r"""
(() => {
  const list = document.querySelector('[data-testid="todo-list"]');
  if (!list) return [];
  return [...list.querySelectorAll('[data-testid^="todo-row-"]')]
    .map(r => (r.innerText || '').replace(/\s+/g,' ').trim());
})()
"""
    return eval_js(js) or []


def row_ids_in_order() -> list:
    """Return todo ids in current DOM order (top -> bottom)."""
    js = r"""
(() => {
  const list = document.querySelector('[data-testid="todo-list"]');
  if (!list) return [];
  return [...list.querySelectorAll('[data-testid^="todo-row-"]')]
    .map(r => parseInt(r.getAttribute('data-testid').replace('todo-row-',''),10));
})()
"""
    return eval_js(js) or []


def drive_reorder_dnd(first_handle_id: int, target_handle_id: int) -> dict:
    """Attempt to drive a @dnd-kit reorder via a synthetic PointerSensor sequence:
    pointerdown on drag-handle-<first>, cross the activation distance, move onto
    drag-handle-<target>, pointerup. dnd-kit's PointerSensor has an activation
    constraint; we emit several incremental moves to satisfy it.

    HONESTY: synthetic pointer drives of dnd-kit are UNRELIABLE (skill caveat).
    This returns {driven, before_ids, after_ids, changed} so the harness can tell
    whether the gesture actually mutated the order. If changed==False the scenario
    falls back to the deterministic persistence check (see S3).
    """
    import time as _t
    before = row_ids_in_order()
    js = r"""
(() => {
  const h1 = document.querySelector('[data-testid="drag-handle-%d"]');
  const h2 = document.querySelector('[data-testid="drag-handle-%d"]');
  if (!h1 || !h2) return JSON.stringify({ok:false, reason:'handle missing'});
  const b1 = h1.getBoundingClientRect(), b2 = h2.getBoundingClientRect();
  const x1 = b1.left + b1.width/2, y1 = b1.top + b1.height/2;
  const x2 = b2.left + b2.width/2, y2 = b2.top + b2.height/2;
  const ev = (type, x, y) => h1.dispatchEvent(new PointerEvent(type, {
    bubbles:true, cancelable:true, pointerId:1, pointerType:'touch',
    isPrimary:true, clientX:x, clientY:y, buttons:1
  }));
  ev('pointerdown', x1, y1);
  // cross activation distance (dnd-kit default ~ a few px) with small steps
  const steps = 12;
  for (let i=1;i<=steps;i++){
    const x = x1 + (x2-x1)*i/steps;
    const y = y1 + (y2-y1)*i/steps;
    document.dispatchEvent(new PointerEvent('pointermove', {
      bubbles:true, cancelable:true, pointerId:1, pointerType:'touch',
      isPrimary:true, clientX:x, clientY:y, buttons:1
    }));
  }
  document.dispatchEvent(new PointerEvent('pointerup', {
    bubbles:true, cancelable:true, pointerId:1, pointerType:'touch',
    isPrimary:true, clientX:x2, clientY:y2, buttons:0
  }));
  return JSON.stringify({ok:true});
})()
""" % (first_handle_id, target_handle_id)
    driven = json.loads(eval_js(js)).get("ok", False)
    _t.sleep(1.0)
    after = row_ids_in_order()
    return {"driven": driven, "before_ids": before, "after_ids": after, "changed": before != after}


def kill_app() -> None:
    _adb(f"adb shell am force-stop {APP_ID}")


def computed_style(testid_selector_js: str, prop: str) -> str:
    """Return a CSS computed-style property for the element matched by the given
    JS expression (which must evaluate to an element or null)."""
    js = (
        "(()=>{const el=(%s); if(!el) return '__noel__';"
        "return getComputedStyle(el).getPropertyValue(%s);})()"
        % (testid_selector_js, json.dumps(prop))
    )
    return eval_js(js)


def press_key(keyevent: str) -> None:
    """Android system key, e.g. KEYCODE_BACK."""
    _adb(f"adb shell input keyevent {keyevent}")


def launch() -> None:
    _adb(f"adb shell am start -n {MAIN_ACTIVITY} >/dev/null 2>&1")


def device_online() -> bool:
    out = _adb("adb shell getprop sys.boot_completed").strip()
    return out == "1"


def get_todo_ids_from_dom(dom: dict) -> list:
    """Extract todo IDs from the DOM (from todo-row-<id> testids)."""
    ids = []
    for el in dom["els"]:
        tid = el.get("testid") or ""
        if tid.startswith("todo-row-"):
            try:
                ids.append(int(tid.split("-")[-1]))
            except ValueError:
                pass
    return ids


def reorder_todos_via_hook(new_id_order: list) -> bool:
    """Drive reorder via the app's React hook (updateOrder) over CDP.

    Since adb swipe doesn't trigger dnd-kit pointer handlers, we inject
    a direct call into the app's window.__vitotodo_reorder hook (if present)
    or manipulate the DnD state programmatically.

    Fallback: use the dnd-kit's programmatic API by dispatching a custom
    reorder event that the app listens to (if wired), else return False.

    NOTE: This is the best-effort CDP-driven approach. The plan §7 / brief
    recommends driving via DOM/hook or CDP DOM manipulation.
    """
    # Try calling window.__vitotodo_reorder if it was exposed (we expose it below)
    order_json = json.dumps(new_id_order)
    js = f"""
(() => {{
  if (typeof window.__vitotodo_reorder === 'function') {{
    window.__vitotodo_reorder({order_json});
    return JSON.stringify({{ok: true, method: 'hook'}});
  }}
  return JSON.stringify({{ok: false, reason: 'hook not exposed'}});
}})()
"""
    result = eval_js(js)
    return json.loads(result)
