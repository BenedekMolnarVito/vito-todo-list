using VitoTodoList.Data;
using VitoTodoList.Models;

namespace VitoTodoList
{
    public partial class TodoEditPage : ContentPage
    {
        private readonly TodoDatabase _database;
        private readonly TodoItem _todoItem;
        private readonly bool _isNew;

        public TodoEditPage(TodoDatabase database, TodoItem todoItem = null)
        {
            InitializeComponent();
            _database = database;
            _todoItem = todoItem ?? new TodoItem();
            _isNew = todoItem == null;

            LoadTodoItem();
        }

        private void LoadTodoItem()
        {
            TitleEntry.Text = _todoItem.Title;
            DescriptionEditor.Text = _todoItem.Description;

            if (_todoItem.Deadline.HasValue)
            {
                DeadlineDatePicker.Date = _todoItem.Deadline.Value.Date;
                DeadlineTimePicker.Time = _todoItem.Deadline.Value.TimeOfDay;
                HasDeadlineCheckBox.IsChecked = true;
            }
            else
            {
                DeadlineDatePicker.Date = DateTime.Today;
                DeadlineTimePicker.Time = DateTime.Now.TimeOfDay;
                HasDeadlineCheckBox.IsChecked = false;
            }
        }

        private async void OnSaveClicked(object sender, EventArgs e)
        {
            if (string.IsNullOrWhiteSpace(TitleEntry.Text))
            {
                await DisplayAlert("Error", "Title is required", "OK");
                return;
            }

            _todoItem.Title = TitleEntry.Text;
            _todoItem.Description = DescriptionEditor.Text;

            if (HasDeadlineCheckBox.IsChecked)
            {
                var date = DeadlineDatePicker.Date;
                var time = DeadlineTimePicker.Time;
                _todoItem.Deadline = new DateTime(date.Year, date.Month, date.Day, time.Hours, time.Minutes, 0);
            }
            else
            {
                _todoItem.Deadline = null;
            }

            await _database.SaveItemAsync(_todoItem);

#if ANDROID
            Platforms.Android.Widgets.WidgetUpdateHelper.UpdateWidget(Platform.CurrentActivity);
#endif

            await Navigation.PopAsync();
        }

        private async void OnCancelClicked(object sender, EventArgs e)
        {
            await Navigation.PopAsync();
        }
    }
}
