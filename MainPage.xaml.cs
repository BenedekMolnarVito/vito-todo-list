using System.Collections.ObjectModel;
using System.Windows.Input;
using VitoTodoList.Data;
using VitoTodoList.Models;
using VitoTodoList.Services;
using Microsoft.Maui.Platform;

namespace VitoTodoList;

public partial class MainPage : ContentPage
{
    private readonly TodoDatabase _database;
    private readonly ExportImportService _exportImportService;
    private ObservableCollection<TodoItem> _todos;
    private TodoItem? _draggedItem;
    private int _lastDragOverIndex = -1;

    public ICommand DeleteCommand { get; }

    public MainPage()
    {
        InitializeComponent();
        _database = new TodoDatabase();
        _exportImportService = new ExportImportService();
        _todos = new ObservableCollection<TodoItem>();
        DeleteCommand = new Command<TodoItem>(async (item) => await DeleteTodoAsync(item));
        BindingContext = this;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await LoadTodosAsync();
    }

    private async Task LoadTodosAsync()
    {
        var items = await _database.GetItemsAsync();
        _todos.Clear();
        foreach (var item in items)
        {
            _todos.Add(item);
        }
        TodoListView.ItemsSource = _todos;
        EmptyState.IsVisible = _todos.Count == 0;
        UpdateWidget();
    }

    private void UpdateWidget()
    {
#if ANDROID
        VitoTodoList.Platforms.Android.Widgets.WidgetUpdateHelper.UpdateWidgets();
#endif
    }

    private void OnDragStarting(object? sender, DragStartingEventArgs e)
    {
        System.Diagnostics.Debug.WriteLine($"OnDragStarting called. Sender: {sender?.GetType().Name}");
        
        // The sender is the DragGestureRecognizer, get the Frame it's attached to
        Frame? frame = null;
        
        if (sender is DragGestureRecognizer recognizer && recognizer.Parent is Frame f)
        {
            frame = f;
            System.Diagnostics.Debug.WriteLine($"Found frame directly from recognizer");
        }
        
        if (frame != null && frame.BindingContext is TodoItem item)
        {
            _draggedItem = item;
            _lastDragOverIndex = _todos.IndexOf(item);
            e.Data.Properties["TodoItem"] = item;
            
            System.Diagnostics.Debug.WriteLine($"SUCCESS: Drag started for '{item.Title}' at index {_lastDragOverIndex}");
            
            // Make the original semi-transparent during drag
            frame.Opacity = 0.4;
            
            // Set drag preview text (Android will display this with the shadow)
            e.Data.Text = $"☰ {item.Title}";
            
            System.Diagnostics.Debug.WriteLine($"Set frame opacity and drag preview for: {item.Title}");
        }
        else
        {
            System.Diagnostics.Debug.WriteLine($"ERROR: Could not find Frame or TodoItem. Frame: {frame != null}, BindingContext type: {frame?.BindingContext?.GetType().Name}");
        }
    }

    private void OnDragOver(object? sender, DragEventArgs e)
    {
        e.AcceptedOperation = DataPackageOperation.Copy;
        
        if (sender is Frame targetFrame && 
            targetFrame.BindingContext is TodoItem targetItem &&
            _draggedItem != null &&
            _draggedItem.Id != targetItem.Id)
        {
            var targetIndex = _todos.IndexOf(targetItem);
            
            // Only log significant changes to reduce overhead
            if (targetIndex != -1 && targetIndex != _lastDragOverIndex)
            {
                _lastDragOverIndex = targetIndex;
            }
        }
    }

    private async void OnDrop(object? sender, DropEventArgs e)
    {
        try
        {
            // Get the drop target
            DropGestureRecognizer? dropRecognizer = sender as DropGestureRecognizer;
            Frame? targetFrame = dropRecognizer?.Parent as Frame;
            TodoItem? targetItem = targetFrame?.BindingContext as TodoItem;
            
            // Restore opacity of all items immediately
            RestoreAllItemsOpacity();
            
            if (_draggedItem != null && targetItem != null && _draggedItem.Id != targetItem.Id)
            {
                // Perform the reorder
                var draggedIndex = _todos.IndexOf(_draggedItem);
                var targetIndex = _todos.IndexOf(targetItem);
                
                if (draggedIndex != -1 && targetIndex != -1 && draggedIndex != targetIndex)
                {
                    _todos.Move(draggedIndex, targetIndex);
                    
                    // Save the new order to database
                    var items = _todos.ToList();
                    await _database.UpdateOrderAsync(items);
                    UpdateWidget();
                }
            }
            else if (_draggedItem != null)
            {
                // Just restore visual state
                RestoreAllItemsOpacity();
            }
        }
        finally
        {
            _draggedItem = null;
            _lastDragOverIndex = -1;
        }
    }

    private void RestoreAllItemsOpacity()
    {
        try
        {
            System.Diagnostics.Debug.WriteLine("Restoring opacity for all items");
            
            // Find all Frame elements in the CollectionView and restore their opacity
            var collectionView = TodoListView;
            if (collectionView?.Handler?.PlatformView is Android.Views.ViewGroup viewGroup)
            {
                RestoreOpacityRecursive(viewGroup);
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error restoring opacity: {ex.Message}");
        }
    }

#if ANDROID
    private void RestoreOpacityRecursive(Android.Views.ViewGroup viewGroup)
    {
        for (int i = 0; i < viewGroup.ChildCount; i++)
        {
            var child = viewGroup.GetChildAt(i);
            if (child != null)
            {
                // Restore alpha to full opacity
                child.Alpha = 1.0f;
                
                // If it's a ViewGroup, recurse into its children
                if (child is Android.Views.ViewGroup childGroup)
                {
                    RestoreOpacityRecursive(childGroup);
                }
            }
        }
    }
#endif

    private void RestoreDraggedItemOpacity()
    {
        // The CollectionView will recreate the visual, but we ensure cleanup
        MainThread.BeginInvokeOnMainThread(() =>
        {
            // Force a visual refresh by touching the collection
            if (_draggedItem != null)
            {
                var index = _todos.IndexOf(_draggedItem);
                if (index >= 0)
                {
                    var item = _todos[index];
                    _todos[index] = item; // Trigger visual update
                }
            }
        });
    }

    private async void OnAddTodoClicked(object? sender, EventArgs e)
    {
        await Navigation.PushAsync(new TodoEditPage(_database));
    }

    private async void OnEditTodoClicked(object? sender, EventArgs e)
    {
        if (sender is Button button && button.CommandParameter is TodoItem item)
        {
            await Navigation.PushAsync(new TodoEditPage(_database, item));
        }
    }

    private async void OnCheckBoxChanged(object? sender, CheckedChangedEventArgs e)
    {
        if (sender is CheckBox checkBox && checkBox.BindingContext is TodoItem item)
        {
            // Update the item's completion state
            item.IsCompleted = e.Value;
            item.CompletedAt = e.Value ? DateTime.Now : null;
            
            // Save to database
            await _database.SaveItemAsync(item);
            
            // The INotifyPropertyChanged on TodoItem will automatically update the UI binding
            // But we still need to update the widget
            UpdateWidget();
        }
    }

    private async Task DeleteTodoAsync(TodoItem item)
    {
        bool confirm = await DisplayAlert("Delete", $"Delete '{item.Title}'?", "Yes", "No");
        if (confirm)
        {
            await _database.DeleteItemAsync(item);
            UpdateWidget();
            await LoadTodosAsync();
        }
    }

    private async void OnExportClicked(object? sender, EventArgs e)
    {
        try
        {
            var items = await _database.GetItemsAsync();
            var json = await _exportImportService.ExportToJsonAsync(items);
            
            var fileName = $"todos_export_{DateTime.Now:yyyyMMdd_HHmmss}.json";
            var filePath = Path.Combine(FileSystem.CacheDirectory, fileName);
            await File.WriteAllTextAsync(filePath, json);

            await Share.Default.RequestAsync(new ShareFileRequest
            {
                Title = "Export Todos",
                File = new ShareFile(filePath)
            });

            await DisplayAlert("Success", "Todos exported successfully!", "OK");
        }
        catch (Exception ex)
        {
            await DisplayAlert("Error", $"Failed to export: {ex.Message}", "OK");
        }
    }

    private async void OnImportClicked(object? sender, EventArgs e)
    {
        try
        {
            var result = await FilePicker.PickAsync(new PickOptions
            {
                PickerTitle = "Select JSON file to import"
            });

            if (result != null)
            {
                var json = await File.ReadAllTextAsync(result.FullPath);
                var items = await _exportImportService.ImportFromJsonAsync(json);

                if (items != null && items.Count > 0)
                {
                    foreach (var item in items)
                    {
                        item.Id = 0; // Reset ID to create new items
                        await _database.SaveItemAsync(item);
                    }
                    await LoadTodosAsync();
                    await DisplayAlert("Success", $"Imported {items.Count} todos!", "OK");
                }
                else
                {
                    await DisplayAlert("Error", "Invalid JSON format", "OK");
                }
            }
        }
        catch (Exception ex)
        {
            await DisplayAlert("Error", $"Failed to import: {ex.Message}", "OK");
        }
    }

    private async void OnShareClicked(object? sender, EventArgs e)
    {
        try
        {
            var items = await _database.GetItemsAsync();
            var json = await _exportImportService.ExportToJsonAsync(items);
            
            var fileName = $"todos_share_{DateTime.Now:yyyyMMdd_HHmmss}.json";
            var filePath = Path.Combine(FileSystem.CacheDirectory, fileName);
            await File.WriteAllTextAsync(filePath, json);

            await Share.Default.RequestAsync(new ShareFileRequest
            {
                Title = "Share Todos",
                File = new ShareFile(filePath)
            });
        }
        catch (Exception ex)
        {
            await DisplayAlert("Error", $"Failed to share: {ex.Message}", "OK");
        }
    }

    private async void OnSetupBackupClicked(object? sender, EventArgs e)
    {
        try
        {
            var driveService = new GoogleDriveService();
            
            // Check if already authenticated
            if (driveService.IsAuthenticated())
            {
                var reset = await DisplayAlert("Already Setup", 
                    "Backup is already configured. Do you want to re-authenticate?", 
                    "Yes", "No");
                
                if (!reset)
                    return;
                    
                await driveService.RevokeAuthenticationAsync();
            }

            // Prompt user to paste OAuth credentials JSON
            var credentialsJson = await DisplayPromptAsync(
                "Setup Google Drive Backup",
                "Paste your OAuth 2.0 Client ID JSON from Google Cloud Console:\n\n" +
                "1. Go to console.cloud.google.com\n" +
                "2. APIs & Services → Credentials\n" +
                "3. Download OAuth 2.0 Client ID JSON\n" +
                "4. Paste the entire JSON content below:",
                placeholder: "{\"installed\":{...}}",
                maxLength: 10000,
                keyboard: Keyboard.Text
            );

            if (string.IsNullOrWhiteSpace(credentialsJson))
            {
                await DisplayAlert("Cancelled", "Backup setup cancelled.", "OK");
                return;
            }

            // Try automatic authentication first, with fallback to manual
            var useManual = await DisplayAlert("Authentication Method",
                "Choose authentication method:\n\n" +
                "AUTO: App tries to open browser (may not work on MIUI/HyperOS)\n" +
                "MANUAL: You open browser yourself and paste code",
                "Manual", "Auto");

            bool success = false;
            
            if (useManual)
            {
                // Manual method - more reliable on restricted devices
                success = await AuthenticateManuallyAsync(driveService, credentialsJson);
            }
            else
            {
                // Automatic method
                try
                {
                    success = await driveService.AuthenticateAsync(credentialsJson);
                }
                catch (Exception authEx)
                {
                    var retry = await DisplayAlert("Auto Failed", 
                        $"Automatic authentication failed: {authEx.Message}\n\n" +
                        "Try manual method instead?", 
                        "Yes", "No");
                    
                    if (retry)
                    {
                        success = await AuthenticateManuallyAsync(driveService, credentialsJson);
                    }
                    else
                    {
                        return;
                    }
                }
            }

            if (success)
            {
                await DisplayAlert("Success", 
                    "Google Drive backup is now configured!\n\n" +
                    "Background backups will run automatically at 3 AM daily.\n" +
                    "You can also use 'Backup Now' to test it.", 
                    "OK");
            }
            else
            {
                await DisplayAlert("Failed", 
                    "Authentication failed. Please try again.", 
                    "OK");
            }
        }
        catch (Exception ex)
        {
            await DisplayAlert("Error", $"Setup failed: {ex.Message}", "OK");
        }
    }

    private async Task<bool> AuthenticateManuallyAsync(GoogleDriveService driveService, string credentialsJson)
    {
        try
        {
            // Generate auth URL and copy to clipboard
            var authUrl = await driveService.GetAuthenticationUrlAsync(credentialsJson);
            
            if (string.IsNullOrEmpty(authUrl))
            {
                await DisplayAlert("Error", "Failed to generate authentication URL", "OK");
                return false;
            }

            await Clipboard.SetTextAsync(authUrl);
            
            await DisplayAlert("Manual Authentication - Step 1",
                "Authentication URL copied to clipboard!\n\n" +
                "Next steps:\n" +
                "1. Open Chrome or Firefox\n" +
                "2. Long-press address bar → Paste\n" +
                "3. Sign in with Google\n" +
                "4. Click 'Allow' to grant access\n" +
                "5. Browser tries to open custom URL (fails)\n" +
                "6. You'll see error like 'Can't open URL'\n" +
                "7. Click 'Copy link' or long-press the failed URL\n" +
                "8. Copy the ENTIRE URL starting with 'com.google...'\n\n" +
                "Tap OK when you have the URL copied.",
                "OK");

            // Prompt for the full redirect URL
            var redirectUrl = await DisplayPromptAsync(
                "Manual Authentication - Step 2",
                "Paste the ENTIRE redirect URL here.\n\n" +
                "After clicking Allow, browser shows an error.\n" +
                "Copy the failed URL that looks like:\n" +
                "com.googleusercontent.apps.XXX:/oauth2redirect?code=4/0Adeu5B...\n\n" +
                "Paste the complete URL below:",
                placeholder: "com.googleusercontent.apps...",
                maxLength: 1000,
                keyboard: Keyboard.Text
            );

            if (string.IsNullOrWhiteSpace(redirectUrl))
            {
                await DisplayAlert("Cancelled", "No URL entered.", "OK");
                return false;
            }

            // Extract code from the redirect URL
            string? authCode = null;
            redirectUrl = redirectUrl.Trim();
            
            if (redirectUrl.Contains("code="))
            {
                var codeStart = redirectUrl.IndexOf("code=") + 5;
                var codeEnd = redirectUrl.IndexOf("&", codeStart);
                if (codeEnd == -1)
                    codeEnd = redirectUrl.Length;
                authCode = redirectUrl.Substring(codeStart, codeEnd - codeStart);
            }
            else
            {
                await DisplayAlert("Error", "No authorization code found in URL. Please make sure you copied the complete redirect URL.", "OK");
                return false;
            }

            // Complete authentication with the code
            var success = await driveService.CompleteAuthenticationAsync(credentialsJson, authCode);
            
            return success;
        }
        catch (Exception ex)
        {
            await DisplayAlert("Error", $"Manual authentication failed: {ex.Message}", "OK");
            return false;
        }
    }

    private async void OnBackupNowClicked(object? sender, EventArgs e)
    {
        try
        {
            var driveService = new GoogleDriveService();
            
            // Check if authenticated
            if (!driveService.IsAuthenticated())
            {
                await DisplayAlert("Not Setup", 
                    "Please setup Google Drive backup first using the 'Setup Backup' button.", 
                    "OK");
                return;
            }

#if ANDROID
            VitoTodoList.Platforms.Android.BackgroundJobs.BackupScheduler.TriggerImmediateBackup(Android.App.Application.Context);
            await DisplayAlert("Success", "Backup job queued! It will run when connected to the internet.", "OK");
#else
            await DisplayAlert("Info", "Backup is only available on Android.", "OK");
#endif
        }
        catch (Exception ex)
        {
            await DisplayAlert("Error", $"Failed to trigger backup: {ex.Message}", "OK");
        }
    }
}
