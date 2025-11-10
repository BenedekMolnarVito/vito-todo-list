using Android.App;
using Android.Content;
using Android.Widget;
using Android.Text;
using Android.Text.Style;
using VitoTodoList.Data;
using VitoTodoList.Models;

namespace VitoTodoList.Platforms.Android.Widgets;

[Service(Permission = "android.permission.BIND_REMOTEVIEWS", Exported = false)]
public class TodoWidgetService : RemoteViewsService
{
    public override IRemoteViewsFactory? OnGetViewFactory(Intent? intent)
    {
        return new TodoRemoteViewsFactory(this.ApplicationContext!);
    }
}

public class TodoRemoteViewsFactory : Java.Lang.Object, RemoteViewsService.IRemoteViewsFactory
{
    private readonly Context _context;
    private List<TodoItem> _todos = new();

    public TodoRemoteViewsFactory(Context context)
    {
        _context = context;
    }

    public void OnCreate()
    {
        // Initial load
        LoadData();
    }

    public void OnDataSetChanged()
    {
        // Reload data when widget is updated
        LoadData();
    }

    private void LoadData()
    {
        try
        {
            // Run synchronously in the widget context
            var database = new TodoDatabase();
            _todos = database.GetItemsAsync().GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error loading todos in widget: {ex.Message}");
            _todos = new List<TodoItem>();
        }
    }

    public void OnDestroy()
    {
        _todos.Clear();
    }

    public int Count => _todos.Count;

    public long GetItemId(int position) => position;

    public RemoteViews? LoadingView => null;

    public RemoteViews GetViewAt(int position)
    {
        if (position < 0 || position >= _todos.Count)
        {
            return new RemoteViews(_context.PackageName, Resource.Layout.widget_list_item);
        }

        var todo = _todos[position];
        var remoteViews = new RemoteViews(_context.PackageName, Resource.Layout.widget_list_item);

        // Build the item text with formatting
        var sb = new SpannableStringBuilder();
        sb.Append("• ");
        sb.Append(todo.Title);

        // Add (...) if description exists
        if (!string.IsNullOrEmpty(todo.Description))
        {
            sb.Append(" (...)");
        }

        // Add deadline in red if it exists
        if (todo.Deadline.HasValue)
        {
            var deadlineText = $" {todo.Deadline.Value:MMM dd, HH:mm}";
            int start = sb.Length();
            sb.Append(deadlineText);
            sb.SetSpan(new ForegroundColorSpan(global::Android.Graphics.Color.Red), 
                      start, sb.Length(), SpanTypes.ExclusiveExclusive);
        }

        remoteViews.SetTextViewText(Resource.Id.widget_item_text, sb);

        // Set click intent for launching app when item is tapped
        var fillInIntent = new Intent();
        fillInIntent.PutExtra("todoId", todo.Id);
        remoteViews.SetOnClickFillInIntent(Resource.Id.widget_item_text, fillInIntent);

        return remoteViews;
    }

    public int ViewTypeCount => 1;

    public bool HasStableIds => true;
}
