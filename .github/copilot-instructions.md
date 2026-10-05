# VitoTodoList - AI Coding Agent Instructions

## Project Overview
.NET MAUI Android todo list app targeting Android API 35 with SQLite persistence, home screen widget support, and data export/import. Single-platform focus: **Android only** (iOS/MacCatalyst/Tizen exist but aren't maintained).

## Critical Architecture Patterns

### Database Layer (`Data/TodoDatabase.cs`)
- **Singleton pattern**: Each page creates its own `TodoDatabase` instance (no DI container)
- **Lazy initialization**: `InitAsync()` called at start of every method (safe for multiple calls)
- **Order management**: New items get `Order = maxOrder + 1`; reordering uses `UpdateOrderAsync(List<TodoItem>)`
- **SQLite path**: `Path.Combine(FileSystem.AppDataDirectory, "todos.db3")`

### Widget Cross-Platform Bridge
**Critical**: Widget updates use platform-specific compilation:
```csharp
#if ANDROID
    VitoTodoList.Platforms.Android.Widgets.WidgetUpdateHelper.UpdateWidgets();
#endif
```
Call `UpdateWidgets()` after **every data mutation** (create/update/delete/reorder/complete). The helper wraps Android-specific code in a shared class accessible from MAUI pages.

### Widget Implementation (`Platforms/Android/Widgets/`)
- **TodoWidgetProvider.cs**: BroadcastReceiver with metadata attributes for Android registration
- **Async in sync context**: `UpdateAppWidget()` is `async void` (called from Android's sync `OnUpdate()`)
- **Spannable text**: Use `SpannableStringBuilder` + `ForegroundColorSpan` for colored deadlines in widget
- **PendingIntent flags**: Conditional `Immutable` flag based on API level:
```csharp
var flags = PendingIntentFlags.UpdateCurrent;
if (Build.VERSION.SdkInt >= BuildVersionCodes.M)
    flags |= PendingIntentFlags.Immutable;
```

### Page Navigation Pattern
No dependency injection - pass dependencies via constructor:
```csharp
await Navigation.PushAsync(new TodoEditPage(_database, item));
```

### Data Binding Conventions
- **Event handlers**: Use `CommandParameter` on buttons: `button.CommandParameter is TodoItem item`
- **Commands**: Expose as `ICommand` properties for SwipeView: `DeleteCommand = new Command<TodoItem>(async (item) => ...)`
- **ObservableCollection**: `_todos` collection manually synced from database (not two-way bound)

## Build & Deployment

### Essential Commands (PowerShell)
```powershell
# Standard build & deploy
dotnet build vito-todo-list.sln -t:Run -f net9.0-android35.0

# Full clean rebuild
dotnet clean vito-todo-list.sln;
dotnet restore vito-todo-list.sln;
dotnet build vito-todo-list.sln -c Release;
dotnet build vito-todo-list.sln -t:Run -f net9.0-android35.0
```

### Target Framework
Single framework: `<TargetFrameworks>net9.0-android35.0</TargetFrameworks>` (note plural PropertyGroup name)

### Android Resources
Widget XML must be in `ItemGroup` with condition:
```xml
<ItemGroup Condition="'$(TargetFramework)' == 'net9.0-android35.0'">
    <AndroidResource Include="Platforms\Android\Resources\**\*.xml" />
</ItemGroup>
```

## Data Serialization

### Export/Import (`Services/ExportImportService.cs`)
- Uses `System.Text.Json` (not Newtonsoft)
- Import resets IDs: `item.Id = 0` before `SaveItemAsync()` to avoid conflicts
- Share via `Share.Default.RequestAsync(new ShareFileRequest { ... })`
- Files in `FileSystem.CacheDirectory` with timestamp: `$"todos_export_{DateTime.Now:yyyyMMdd_HHmmss}.json"`

## UI Patterns

### XAML Converters (`Converters/`)
- **BoolToTextDecorationConverter**: Strikethrough for `IsCompleted`
- **StringToBoolConverter**: Show/hide UI elements based on non-empty strings
- **HasValueConverter**: Check `Deadline.HasValue` for visibility

### Empty State Pattern
Toggle visibility based on collection count:
```csharp
EmptyState.IsVisible = _todos.Count == 0;
```

### Validation
Minimal validation - only `Title` required in `TodoEditPage`:
```csharp
if (string.IsNullOrWhiteSpace(TitleEntry.Text))
    await DisplayAlert("Validation Error", "Title is required", "OK");
```

## Common Gotchas

1. **Always call widget update**: After ANY data change, call `WidgetUpdateHelper.UpdateWidgets()` wrapped in `#if ANDROID`
2. **Reload after mutations**: Call `await LoadTodosAsync()` after save/delete to refresh UI and rebuild `ObservableCollection`
3. **Checkbox binding**: Handle `CheckedChangedEvent` manually - binding is one-way, update `IsCompleted` + `CompletedAt` + save
4. **Reordering**: Swap in list, call `UpdateOrderAsync()`, then reload - don't just update Order property
5. **No DI**: Don't add services to `MauiProgram.cs` - project uses direct instantiation
6. **Android-only code**: Widget logic, MainActivity customization all in `Platforms/Android/` - no shared abstractions

## Key Files Reference
- `MainPage.xaml.cs` - Main UI orchestration, all button handlers
- `Data/TodoDatabase.cs` - All database operations, order management
- `Platforms/Android/Widgets/TodoWidgetProvider.cs` - Widget rendering, spannable text
- `IMPLEMENTATION_SUMMARY.md` - Complete feature checklist, architecture decisions

---

## React + TypeScript + Vite + Capacitor (branch: feat/rework-react-capacitor)

> Phase 0 scaffold added. MAUI sources preserved; removal happens in Phase 7.

### New Stack

React 18 + TypeScript 5 + Vite 7, Android via Capacitor 8.
DB = `@capacitor-community/sqlite` (on-device SQLite, shared with Kotlin widget).
Drag reorder: `@dnd-kit`. Swipe-delete: `react-swipeable-list`.

### Gate (all must pass before merge)

```
npx tsc --noEmit    # typecheck — de-facto lint (no separate lint command)
npm run build       # vite build
npm run test        # vitest run
```

### Key Conventions

- `globals: false` in vitest — import `{ describe, it, expect, vi }` from `"vitest"` explicitly.
- Capacitor plugins mocked via alias in `vitest.config.ts` → `src/__mocks__/`.
- `better-sqlite3` is DEV-ONLY (test driver). Never import in app code.
- Do NOT delete MAUI files (*.xaml, *.cs, *.csproj, *.sln) — Phase 7 handles removal.

### Spec Sources

- `docs/REWORK_PLAN_react-capacitor.md` — full plan (§2 stack, §3 structure, §4 data, §7 tests).

