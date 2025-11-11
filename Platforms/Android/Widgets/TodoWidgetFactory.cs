using Android.Content;
using Android.Widget;
using Android.Text;
using Android.Text.Style;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using VitoTodoList.Models;
using VitoTodoList.Data;

namespace VitoTodoList.Platforms.Android.Widgets
{
    public class TodoWidgetFactory : Java.Lang.Object, RemoteViewsService.IRemoteViewsFactory
    {
        private Context _context;
        private List<TodoItem> _todoItems = new List<TodoItem>();
        private TodoDatabase _database;

        public TodoWidgetFactory(Context context)
        {
            _context = context;
            _database = new TodoDatabase();
        }

        public void OnCreate()
        {
            System.Diagnostics.Debug.WriteLine("TodoWidgetFactory: OnCreate called");
            // Initialize database
            Task.Run(async () =>
            {
                await _database.InitAsync();
                await LoadDataAsync();
            }).Wait();
        }

        public void OnDataSetChanged()
        {
            System.Diagnostics.Debug.WriteLine("TodoWidgetFactory: OnDataSetChanged called");
            // Reload data when notified
            Task.Run(async () => await LoadDataAsync()).Wait();
        }

        private async Task LoadDataAsync()
        {
            try
            {
                await _database.InitAsync();
                var items = await _database.GetItemsAsync();
                _todoItems = new List<TodoItem>(items);
                System.Diagnostics.Debug.WriteLine($"TodoWidgetFactory: Loaded {_todoItems.Count} items");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"TodoWidgetFactory: Error loading data: {ex.Message}");
                _todoItems = new List<TodoItem>();
            }
        }

        public void OnDestroy()
        {
            _todoItems?.Clear();
        }

        public int Count => _todoItems?.Count ?? 0;

        public long GetItemId(int position)
        {
            return position;
        }

        public RemoteViews GetViewAt(int position)
        {
            try
            {
                if (position < 0 || position >= _todoItems.Count)
                    return null;

                var item = _todoItems[position];
                var remoteViews = new RemoteViews(_context.PackageName, Resource.Layout.todo_widget_item);

                // Set checkbox icon based on completion status
                remoteViews.SetTextViewText(Resource.Id.item_checkbox, item.IsCompleted ? "✓" : "○");

                // Build title with strikethrough if completed
                var titleBuilder = new SpannableStringBuilder(item.Title);
                if (item.IsCompleted)
                {
                    titleBuilder.SetSpan(
                        new StrikethroughSpan(),
                        0,
                        item.Title.Length,
                        SpanTypes.ExclusiveExclusive);
                }
                remoteViews.SetTextViewText(Resource.Id.item_title, titleBuilder);

                // Set deadline if exists
                if (item.Deadline.HasValue)
                {
                    var deadlineText = item.Deadline.Value.ToString("MMM dd, HH:mm");
                    var deadlineBuilder = new SpannableStringBuilder(deadlineText);
                    deadlineBuilder.SetSpan(
                        new ForegroundColorSpan(global::Android.Graphics.Color.Red),
                        0,
                        deadlineText.Length,
                        SpanTypes.ExclusiveExclusive);
                    remoteViews.SetTextViewText(Resource.Id.item_deadline, deadlineBuilder);
                    remoteViews.SetViewVisibility(Resource.Id.item_deadline, global::Android.Views.ViewStates.Visible);
                }
                else
                {
                    remoteViews.SetViewVisibility(Resource.Id.item_deadline, global::Android.Views.ViewStates.Gone);
                }

                // Set fill intent for item click
                var fillIntent = new Intent();
                remoteViews.SetOnClickFillInIntent(Resource.Id.item_container, fillIntent);

                return remoteViews;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"TodoWidgetFactory: Error in GetViewAt: {ex.Message}");
                return null;
            }
        }

        public RemoteViews LoadingView => null;

        public int ViewTypeCount => 1;

        public bool HasStableIds => true;
    }
}
