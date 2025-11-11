using Android.Content;
using Android.Widget;
using Android.Text;
using Android.Text.Style;
using VitoTodoList.Data;
using VitoTodoList.Models;

namespace VitoTodoList.Platforms.Android.Widgets;

public class TodoWidgetFactory : Java.Lang.Object, RemoteViewsService.IRemoteViewsFactory
{
    private readonly Context _context;
    private List<TodoItem> _todos = new();

    public TodoWidgetFactory(Context context)
    {
        _context = context;
    }

    public void OnCreate()
    {
        // Initial data load
        LoadDataAsync().Wait();
    }

    public void OnDataSetChanged()
    {
        // Refresh data when widget is updated
        LoadDataAsync().Wait();
    }

    public void OnDestroy()
    {
        _todos.Clear();
    }

    public int Count => _todos.Count;

    public long GetItemId(int position)
    {
        return position;
    }

    public bool HasStableIds => true;

    public RemoteViews? LoadingView => null;

    public int ViewTypeCount => 1;

    public RemoteViews GetViewAt(int position)
    {
        if (position < 0 || position >= _todos.Count)
        {
            return new RemoteViews(_context.PackageName, Resource.Layout.todo_widget_item);
        }

        var todo = _todos[position];
        var remoteViews = new RemoteViews(_context.PackageName, Resource.Layout.todo_widget_item);

        // Build the formatted text with SpannableStringBuilder
        var sb = new SpannableStringBuilder();
        
        // Add bullet point
        sb.Append(todo.IsCompleted ? "✓ " : "• ");
        
        // Add title
        int titleStart = sb.Length();
        sb.Append(todo.Title);
        
        // Apply strikethrough if completed
        if (todo.IsCompleted)
        {
            sb.SetSpan(new StrikethroughSpan(), titleStart, sb.Length(), SpanTypes.ExclusiveExclusive);
        }
        
        // Add ellipsis if description exists
        if (!string.IsNullOrWhiteSpace(todo.Description))
        {
            sb.Append(" (...)");
        }
        
        // Add deadline in red if it exists
        if (todo.Deadline.HasValue)
        {
            var deadlineText = $" {todo.Deadline.Value:MMM dd, HH:mm}";
            int start = sb.Length();
            sb.Append(deadlineText);
            sb.SetSpan(new ForegroundColorSpan(global::Android.Graphics.Color.Red), start, sb.Length(), SpanTypes.ExclusiveExclusive);
        }

        remoteViews.SetTextViewText(Resource.Id.widget_item_text, sb);

        // Set click intent for individual items
        var intent = new Intent();
        intent.PutExtra("todoId", todo.Id);
        remoteViews.SetOnClickFillInIntent(Resource.Id.widget_item_text, intent);

        return remoteViews;
    }

    private async Task LoadDataAsync()
    {
        try
        {
            var database = new TodoDatabase();
            _todos = await database.GetItemsAsync();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error loading todos in widget factory: {ex.Message}");
            _todos = new List<TodoItem>();
        }
    }
}
