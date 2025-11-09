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
            await LoadTodosAsync();
        }
    }

    private async Task DeleteTodoAsync(TodoItem item)
    {
        bool confirm = await DisplayAlert("Delete", $"Delete '{item.Title}'?", "Yes", "No");
        if (confirm)
        {
            await _database.DeleteItemAsync(item);
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
