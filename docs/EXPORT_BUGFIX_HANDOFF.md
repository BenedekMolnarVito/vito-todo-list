# Export Button Bugfix — Handoff

> UPDATE (2026-10-11, `feat/bugfix/remove-share-move-export-import`):
> Direction changed per user decision — **Filesystem dropped entirely, Share kept**.
> `exportAndShare` now sends the JSON as Share-sheet *text* (no file write),
> which sidesteps the DOWNLOADS `mkdir`/`writeFile` failure below completely.
> Gate green: `tsc` clean, `vite build` ok, `npm run test` 120 passed + 1 skipped
> (incl. 2 new `exportAndShare` hook tests). `cap sync` lists only
> sqlite/app/share plugins. The "Remaining Issue" section below is OBSOLETE —
> kept for context only.

## Problem
Export button on Android does nothing. Root cause: the button used an
anchor-blob-download trick (`a.click()` with `download` attr) that silently
fails on Android WebView (no `download` attribute support, no filesystem
access). User expects a share dialog.

## Fix Applied
Re-added `@capacitor/filesystem` + `@capacitor/share`. Added `exportAndShare`
platform-aware function to `useTodos` hook:
- **Native**: `Filesystem.writeFile` to DOWNLOADS → `Share.share` (share dialog)
- **Web**: anchor-download fallback (unchanged behavior)

### Files Changed
- `src/hooks/useTodos.ts` — added `exportAndShare`, `SharePlugin`/`FilesystemPlugin`
  type defs, `mkdir` to FilesystemPlugin interface
- `src/components/TodoListPage.tsx` — Export button calls `onExportAndShare()`
  instead of inline anchor-download
- `src/App.tsx` — imports Filesystem/Share, passes to hook on native platform
- `package.json` / `package-lock.json` — added `@capacitor/filesystem ^8.1.4`,
  `@capacitor/share ^8.0.3`
- `.gitignore` — added `__pycache__/` and `*.pyc`

### Untracked Cleanup
- Ran `git rm -r --cached node_modules/ dist/` (were tracked in git despite
  `.gitignore`) — changes staged but **not committed**.

## Backup Created
Pulled live DB from phone (`adb shell run-as` + base64), dumped 41 todos as
camelCase JSON:
`C:\Users\molna\AppData\Local\Temp\todos_backup.json`

## Current Status
- `npx tsc --noEmit` — PASS
- `npm run build` — PASS
- `npm run test` — 118 passed, 1 skipped
- APK builds + installs on emulator (`Pixel_6_Pro`)
- **Export button tap confirmed** via ADB on emulator (logcat shows
  Filesystem.writeFile + Share.share being called)

## Remaining Issue (NEEDS FIX)
On the emulator, `Filesystem.writeFile` to `Directory.DOWNLOADS` fails:
```
"Missing parent directory – possibly recursive=false was passed
 or parent directory creation failed."
```
The Downloads subdirectory doesn’t exist at
`/storage/emulated/0/Android/data/app.servimus.vitododlist/files/Download/`.
`mkdir({ path: "", directory: "DOWNLOADS", recursive: true })` fails with
"Directory at '/' already exists" (Capacitor v8 bug).

**TODO**: Fix the Filesystem directory creation flow. Options:
1. Try `Directory.EXTERNAL_STORAGE` with a subdirectory path + recursive
2. Try `Directory.DOCUMENTS`
3. Fall back to `Share.share({ text: json })` (text-only share, no file write)

## Next Session
1. Fix the Filesystem DOWNLOADS issue (see above)
2. Rebuild APK, test Export on emulator again
3. Optionally test on the user's physical phone (currently connected: `527f58ac`)
4. Commit + push + open PR on `feat/bugfix/export-button` branch
