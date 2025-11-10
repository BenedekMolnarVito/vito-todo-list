using System.Collections.ObjectModel;
using System.Windows.Input;
using VitoTodoList.Data;
using VitoTodoList.Models;
using VitoTodoList.Services;

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
        
        // The sender is the DragGestureRecognizer, we need to get the parent element it's attached to
        View? dragHandle = null;
        
        if (sender is DragGestureRecognizer recognizer && recognizer.Parent is View view)
        {
            dragHandle = view;
            System.Diagnostics.Debug.WriteLine($"Found drag handle: {dragHandle.GetType().Name}");
        }
        else if (sender is View v)
        {
            dragHandle = v;
            System.Diagnostics.Debug.WriteLine($"Sender is View: {dragHandle.GetType().Name}");
        }
        
        if (dragHandle != null)
        {
            // Navigate up to find the Frame that has the TodoItem as BindingContext
            var parent = dragHandle.Parent;
            int depth = 0;
            while (parent != null && parent.BindingContext is not TodoItem)
            {
                System.Diagnostics.Debug.WriteLine($"  Parent {depth}: {parent.GetType().Name}, BindingContext: {parent.BindingContext?.GetType().Name}");
                parent = parent.Parent;
                depth++;
            }

            if (parent?.BindingContext is TodoItem item)
            {
                _draggedItem = item;
                _lastDragOverIndex = _todos.IndexOf(item);
                e.Data.Properties["TodoItem"] = item;
                
                System.Diagnostics.Debug.WriteLine($"SUCCESS: Drag started for '{item.Title}' at index {_lastDragOverIndex}");
                
                // Add visual feedback - reduce opacity of the Frame
                if (parent is Frame frame)
                {
                    frame.Opacity = 0.5;
                    System.Diagnostics.Debug.WriteLine($"Set frame opacity to 0.5");
                }
            }
            else
            {
                System.Diagnostics.Debug.WriteLine($"ERROR: Could not find TodoItem in parent hierarchy. Last parent: {parent?.GetType().Name}");
            }
        }
        else
        {
            System.Diagnostics.Debug.WriteLine($"ERROR: Could not find drag handle from sender");
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
            var draggedIndex = _todos.IndexOf(_draggedItem);
            var targetIndex = _todos.IndexOf(targetItem);

            System.Diagnostics.Debug.WriteLine($"Drag over: {targetItem.Title} (target index: {targetIndex}, dragged index: {draggedIndex})");

            if (draggedIndex != -1 && targetIndex != -1 && draggedIndex != targetIndex && targetIndex != _lastDragOverIndex)
            {
                System.Diagnostics.Debug.WriteLine($"Moving item from {draggedIndex} to {targetIndex}");
                
                // Real-time reordering: move item in the collection
                _todos.Move(draggedIndex, targetIndex);
                _lastDragOverIndex = targetIndex;
            }
        }
    }

    private async void OnDrop(object? sender, DropEventArgs e)
    {
        System.Diagnostics.Debug.WriteLine($"Drop event triggered. Sender type: {sender?.GetType().Name}, _draggedItem is null: {_draggedItem == null}");
        
        // Get the drop target
        DropGestureRecognizer? dropRecognizer = sender as DropGestureRecognizer;
        Frame? targetFrame = dropRecognizer?.Parent as Frame;
        TodoItem? targetItem = targetFrame?.BindingContext as TodoItem;
        
        System.Diagnostics.Debug.WriteLine($"Target frame: {targetFrame != null}, Target item: {targetItem?.Title}");
        
        if (targetFrame != null)
        {
            // Restore opacity
            targetFrame.Opacity = 1.0;
        }
        
        if (_draggedItem != null && targetItem != null && _draggedItem.Id != targetItem.Id)
        {
            System.Diagnostics.Debug.WriteLine($"Reordering: moving '{_draggedItem.Title}' to position of '{targetItem.Title}'");
            
            // Perform the reorder one final time
            var draggedIndex = _todos.IndexOf(_draggedItem);
            var targetIndex = _todos.IndexOf(targetItem);
            
            System.Diagnostics.Debug.WriteLine($"Dragged index: {draggedIndex}, Target index: {targetIndex}");
            
            if (draggedIndex != -1 && targetIndex != -1 && draggedIndex != targetIndex)
            {
                _todos.Move(draggedIndex, targetIndex);
                System.Diagnostics.Debug.WriteLine($"Moved item in collection");
            }
            
            // Save the new order to database
            var items = _todos.ToList();
            System.Diagnostics.Debug.WriteLine($"Final order: {string.Join(", ", items.Select(i => i.Title))}");
            
            await _database.UpdateOrderAsync(items);
            UpdateWidget();
            
            // Then reload to restore opacity and refresh UI
            await LoadTodosAsync();
            
            _draggedItem = null;
            _lastDragOverIndex = -1;
        }
        else if (_draggedItem != null)
        {
            System.Diagnostics.Debug.WriteLine($"No reorder needed - same item or no target. Restoring opacity.");
            // Just restore opacity
            await LoadTodosAsync();
            _draggedItem = null;
            _lastDragOverIndex = -1;
        }
        else
        {
            System.Diagnostics.Debug.WriteLine("WARNING: _draggedItem is null in OnDrop!");
        }
    }

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
            item.IsCompleted = e.Value;
            item.CompletedAt = e.Value ? DateTime.Now : null;
            await _database.SaveItemAsync(item);
            UpdateWidget();
            await LoadTodosAsync();
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
}
