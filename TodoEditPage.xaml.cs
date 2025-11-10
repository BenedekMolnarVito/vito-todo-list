using VitoTodoList.Data;
using VitoTodoList.Models;

namespace VitoTodoList;

public partial class TodoEditPage : ContentPage
{
    private readonly TodoDatabase _database;
    private readonly TodoItem? _existingItem;
    
    public string PageTitle { get; set; }

    public TodoEditPage(TodoDatabase database, TodoItem? existingItem = null)
    {
        InitializeComponent();
        _database = database;
        _existingItem = existingItem;
        
        PageTitle = existingItem == null ? "Add Todo" : "Edit Todo";
        
        if (existingItem != null)
        {
            TitleEntry.Text = existingItem.Title;
            DescriptionEditor.Text = existingItem.Description;
            
            if (existingItem.Deadline.HasValue)
            {
                HasDeadlineCheckBox.IsChecked = true;
                DeadlineDatePicker.Date = existingItem.Deadline.Value.Date;
                DeadlineTimePicker.Time = existingItem.Deadline.Value.TimeOfDay;
            }
        }
        else
        {
            DeadlineDatePicker.Date = DateTime.Now.Date;
            DeadlineTimePicker.Time = DateTime.Now.TimeOfDay;
        }

        BindingContext = this;
    }

    private void OnHasDeadlineChanged(object? sender, CheckedChangedEventArgs e)
    {
        // Visibility is bound to the checkbox, so no action needed here
    }

    private async void OnSaveClicked(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(TitleEntry.Text))
        {
            await DisplayAlert("Validation Error", "Title is required", "OK");
            return;
        }

        var item = _existingItem ?? new TodoItem();
        item.Title = TitleEntry.Text.Trim();
        item.Description = string.IsNullOrWhiteSpace(DescriptionEditor.Text) ? null : DescriptionEditor.Text.Trim();
        
        if (HasDeadlineCheckBox.IsChecked)
        {
            var date = DeadlineDatePicker.Date;
            var time = DeadlineTimePicker.Time;
            item.Deadline = date.Add(time);
        }
        else
        {
            item.Deadline = null;
        }

        await _database.SaveItemAsync(item);
        
#if ANDROID
        VitoTodoList.Platforms.Android.Widgets.WidgetUpdateHelper.UpdateWidgets();
#endif
        
        await Navigation.PopAsync();
    }

    private async void OnCancelClicked(object? sender, EventArgs e)
    {
        await Navigation.PopAsync();
    }
}
