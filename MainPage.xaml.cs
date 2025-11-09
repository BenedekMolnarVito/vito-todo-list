using System.Collections.ObjectModel;
using VitoTodoList.Data;
using VitoTodoList.Models;
using VitoTodoList.Services;

namespace VitoTodoList
{
    public partial class MainPage : ContentPage
    {
        private readonly TodoDatabase _database;
        private ObservableCollection<TodoItem> _todoItems;

        public ObservableCollection<TodoItem> TodoItems
        {
            get => _todoItems;
            set
            {
                _todoItems = value;
                OnPropertyChanged();
            }
        }

        public MainPage()
        {
            InitializeComponent();
            _database = MauiProgram.CreateMauiApp().Services.GetService<TodoDatabase>();
            _todoItems = new ObservableCollection<TodoItem>();
            TodoCollectionView.ItemsSource = _todoItems;
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
            _todoItems.Clear();
            foreach (var item in items)
            {
                _todoItems.Add(item);
            }

            // Update widget
#if ANDROID
            Platforms.Android.Widgets.WidgetUpdateHelper.UpdateWidget(Platform.CurrentActivity);
#endif
        }

        private async void OnAddTodoClicked(object sender, EventArgs e)
        {
            await Navigation.PushAsync(new TodoEditPage(_database));
        }

        private async void OnCheckBoxChanged(object sender, CheckedChangedEventArgs e)
        {
            if (sender is CheckBox checkBox && checkBox.BindingContext is TodoItem item)
            {
                item.IsCompleted = e.Value;
                await _database.SaveItemAsync(item);
                
#if ANDROID
                Platforms.Android.Widgets.WidgetUpdateHelper.UpdateWidget(Platform.CurrentActivity);
#endif
            }
        }

        public Command<TodoItem> EditCommand => new Command<TodoItem>(async (item) =>
        {
            await Navigation.PushAsync(new TodoEditPage(_database, item));
        });

        public Command<TodoItem> DeleteCommand => new Command<TodoItem>(async (item) =>
        {
            bool confirm = await DisplayAlert("Delete", $"Delete '{item.Title}'?", "Yes", "No");
            if (confirm)
            {
                await _database.DeleteItemAsync(item);
                _todoItems.Remove(item);
                
#if ANDROID
                Platforms.Android.Widgets.WidgetUpdateHelper.UpdateWidget(Platform.CurrentActivity);
#endif
            }
        });

        private async void OnExportClicked(object sender, EventArgs e)
        {
            try
            {
                var items = await _database.GetItemsAsync();
                var result = await ExportImportService.ExportTodosAsync(items);
                
                if (result != null)
                {
                    await DisplayAlert("Success", $"Exported {items.Count} todos to {result.FileName}", "OK");
                }
            }
            catch (Exception ex)
            {
                await DisplayAlert("Error", $"Failed to export: {ex.Message}", "OK");
            }
        }

        private async void OnImportClicked(object sender, EventArgs e)
        {
            try
            {
                var items = await ExportImportService.ImportTodosAsync();
                
                if (items != null && items.Count > 0)
                {
                    foreach (var item in items)
                    {
                        await _database.SaveItemAsync(item);
                    }
                    
                    await LoadTodosAsync();
                    await DisplayAlert("Success", $"Imported {items.Count} todos", "OK");
                }
            }
            catch (Exception ex)
            {
                await DisplayAlert("Error", $"Failed to import: {ex.Message}", "OK");
            }
        }
    }
}
