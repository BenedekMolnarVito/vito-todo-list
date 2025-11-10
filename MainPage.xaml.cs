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
        // The sender is the DragGestureRecognizer, get the Frame it's attached to
        Frame? frame = null;
        
        if (sender is DragGestureRecognizer recognizer && recognizer.Parent is Frame f)
        {
            frame = f;
        }
        
        if (frame != null && frame.BindingContext is TodoItem item)
        {
            _draggedItem = item;
            _lastDragOverIndex = _todos.IndexOf(item);
            e.Data.Properties["TodoItem"] = item;
            
            // Make the original semi-transparent during drag
            frame.Opacity = 0.4;
            
            // Set drag preview text (Android will display this with the shadow)
            e.Data.Text = $"☰ {item.Title}";
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

            if (draggedIndex != -1 && targetIndex != -1 && draggedIndex != targetIndex && targetIndex != _lastDragOverIndex)
            {
                // Real-time reordering: move item in the collection
                _todos.Move(draggedIndex, targetIndex);
                _lastDragOverIndex = targetIndex;
            }
        }
    }

    private async void OnDrop(object? sender, DropEventArgs e)
    {
        // Get the drop target
        DropGestureRecognizer? dropRecognizer = sender as DropGestureRecognizer;
        Frame? targetFrame = dropRecognizer?.Parent as Frame;
        TodoItem? targetItem = targetFrame?.BindingContext as TodoItem;
        
        // Restore opacity of all items immediately
        RestoreAllItemsOpacity();
        
        if (_draggedItem != null && targetItem != null && _draggedItem.Id != targetItem.Id)
        {
            // Perform the reorder one final time
            var draggedIndex = _todos.IndexOf(_draggedItem);
            var targetIndex = _todos.IndexOf(targetItem);
            
            if (draggedIndex != -1 && targetIndex != -1 && draggedIndex != targetIndex)
            {
                _todos.Move(draggedIndex, targetIndex);
            }
            
            // Save the new order to database
            var items = _todos.ToList();
            await _database.UpdateOrderAsync(items);
            UpdateWidget();
            
            _draggedItem = null;
            _lastDragOverIndex = -1;
        }
        else if (_draggedItem != null)
        {
            // No reorder needed
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
            item.IsCompleted = e.Value;
            item.CompletedAt = e.Value ? DateTime.Now : null;
            await _database.SaveItemAsync(item);
            UpdateWidget();
            
            // Reload to update strikethrough binding
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
