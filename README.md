# VitoTodoList - Android Todo List App

A feature-rich Todo List application for Android built with .NET MAUI, targeting Android API 35.

## Features

### Core Functionality
- **CRUD Operations**: Create, Read, Update, and Delete todo items
- **SQLite Database**: Local persistent storage for all todo items
- **Optional Deadlines**: Set deadlines with month, day, and hour precision
- **Completion Tracking**: Mark items as complete with timestamps
- **Item Reordering**: Move items up and down in the list

### Advanced Features
- **Android Home Screen Widget**
  - Resizable widget showing your todo items
  - **Scrollable list** - view unlimited todo items with native scrolling
  - Uses RemoteViews collection for optimal performance
  - Tap to open the full app
  - Auto-updates when todos change
  
- **Export/Import**
  - Export todos to JSON format
  - Import todos from JSON files
  - Preserve all data including deadlines and completion status

- **Share Functionality**
  - Share your todo list via any installed app
  - Compatible with Google Drive, OneDrive, email, etc.

- **Automatic Backup to Google Drive** ⭐ NEW
  - Daily automatic backup at 3 AM
  - Uploads todo list as JSON to your Google Drive
  - Offline queue - backups are queued when device is offline
  - Automatic retry with exponential backoff
  - See [GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md) for setup instructions

## Technology Stack

- **.NET MAUI 9.0** - Cross-platform framework
- **Android API 35** - Target platform
- **SQLite** - Local database (sqlite-net-pcl)
- **C# 12** - Programming language

## Project Structure

```
VitoTodoList/
├── Models/
│   └── TodoItem.cs              # Data model for todo items
├── Data/
│   └── TodoDatabase.cs          # SQLite database access
├── Services/
│   ├── ExportImportService.cs   # JSON export/import logic
│   ├── GoogleDriveService.cs    # Google Drive backup service
│   └── BackupQueueService.cs    # Offline backup queue
├── Converters/
│   ├── BoolToTextDecorationConverter.cs
│   ├── StringToBoolConverter.cs
│   └── HasValueConverter.cs
├── Platforms/
│   └── Android/
│       ├── Widgets/
│       │   ├── TodoWidgetProvider.cs    # Widget implementation
│       │   ├── TodoWidgetService.cs     # RemoteViewsService for widget
│       │   ├── TodoWidgetFactory.cs     # RemoteViewsFactory for data
│       │   └── WidgetUpdateHelper.cs    # Widget update helper
│       ├── BackgroundJobs/
│       │   ├── DailyBackupWorker.cs     # WorkManager backup worker
│       │   └── BackupScheduler.cs       # Backup job scheduler
│       └── Resources/
│           ├── layout/
│           │   ├── todo_widget.xml      # Widget layout
│           │   └── todo_widget_item.xml # Widget list item layout
│           └── xml/
│               └── todo_widget_info.xml # Widget configuration
├── MainPage.xaml                # Main todo list UI
├── MainPage.xaml.cs            # Main page logic
├── TodoEditPage.xaml           # Add/Edit todo UI
└── TodoEditPage.xaml.cs        # Add/Edit logic
```

## Building the App

### Prerequisites
- .NET 9.0 SDK
- .NET MAUI workload for Android
- Android SDK (API 35)

### Installation

1. Install .NET MAUI workload:
```bash
dotnet workload install maui-android
```

2. Restore dependencies:
```bash
dotnet restore vito-todo-list.sln
```

3. Build the project:
```bash
dotnet build vito-todo-list.sln -c Release
```

4. Deploy to device/emulator:
```bash
dotnet build vito-todo-list.sln -t:Run -f net9.0-android35.0
```


5. (Optional) Clean project:
```bash
dotnet clean vito-todo-list.sln
```

6. (Optional) Full clean rebuild:
```bash
dotnet clean vito-todo-list.sln;
dotnet restore vito-todo-list.sln;
dotnet build vito-todo-list.sln -c Release;
dotnet build vito-todo-list.sln -t:Run -f net9.0-android35.0
```

## Usage

### Managing Todos
1. **Add Todo**: Click "Add Todo" button, enter title, optional description and deadline
2. **Edit Todo**: Click "Edit" button on any todo item
3. **Complete Todo**: Check the checkbox to mark as complete
4. **Delete Todo**: Swipe left and tap "Delete" (or use swipe menu)
5. **Reorder**: Use ↑ and ↓ buttons to move items up or down

### Using the Widget
1. Long-press on your Android home screen
2. Select "Widgets"
3. Find "Todo List Widget"
4. Drag to home screen
5. Resize as needed (supports both horizontal and vertical resizing)
6. Tap widget to open the full app

### Export/Import
- **Export**: Click "Export" to save todos as JSON file, then share via any app
- **Import**: Click "Import", select a JSON file with todo data

### Sharing
- Click "Share" to share your todo list via installed apps (email, cloud storage, etc.)

### Automatic Backup
- **Setup Required**: Follow [GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md) to configure Google Drive authentication
- Backups run automatically every day at 3 AM
- Files are saved to your Google Drive folder: `VitoTodoList_BCP`
- If offline at backup time, the backup is queued and retried when online
- Up to 5 retry attempts with exponential backoff

## Database Schema

**TodoItem Table:**
- `Id` (int, PrimaryKey, AutoIncrement)
- `Title` (string, MaxLength: 200)
- `Description` (string, nullable)
- `Deadline` (DateTime, nullable)
- `IsCompleted` (bool)
- `Order` (int)
- `CreatedAt` (DateTime)
- `CompletedAt` (DateTime, nullable)

## Widget Behavior

- Updates automatically when todos are added, edited, deleted, or reordered
- **Scrollable ListView** - displays all todo items with native Android scrolling
- Uses RemoteViewsService and RemoteViewsFactory architecture
- Completed items shown with ✓, incomplete with ○
- Supports formatted text (strikethrough for completed, red deadline dates)
- Empty state message when no todos exist
- Individual item click support (opens main app)

## License

This project is open source and available under the MIT License.

## Development

Built with ❤️ using .NET MAUI and C#
