using Android.App;
using Android.Appwidget;
using Android.Content;
using Android.Widget;
using VitoTodoList.Data;
using System.Text;
using Android.Text;
using Android.Text.Style;

namespace VitoTodoList.Platforms.Android.Widgets;

[BroadcastReceiver(Label = "Todo Widget", Exported = true)]
[IntentFilter(new string[] { "android.appwidget.action.APPWIDGET_UPDATE" })]
[MetaData("android.appwidget.provider", Resource = "@xml/todo_widget_info")]
public class TodoWidgetProvider : AppWidgetProvider
{
    public override void OnUpdate(Context? context, AppWidgetManager? appWidgetManager, int[]? appWidgetIds)
    {
        if (context == null || appWidgetManager == null || appWidgetIds == null)
            return;

        foreach (var appWidgetId in appWidgetIds)
        {
            UpdateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    private static async void UpdateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId)
    {
        try
        {
            var database = new TodoDatabase();
            var todos = await database.GetItemsAsync();

            // Build the widget content
            var remoteViews = new RemoteViews(context.PackageName, Resource.Layout.todo_widget);
            
            var sb = new SpannableStringBuilder();
            
            if (todos.Count == 0)
            {
                sb.Append("No todos yet!\nTap to open app.");
            }
            else
            {
                // Show up to 15 items in widget (to fit in most widget sizes)
                int maxItems = Math.Min(todos.Count, 15);
                
                for (int i = 0; i < maxItems; i++)
                {
                    var todo = todos[i];
                    // Use bullet point for each item
                    sb.Append(todo.IsCompleted ? "✓ " : "• ");
                    
                    // Store the start position for the title
                    int titleStart = sb.Length();
                    sb.Append(todo.Title);
                    
                    // Apply strikethrough if completed
                    if (todo.IsCompleted)
                    {
                        sb.SetSpan(new StrikethroughSpan(), titleStart, sb.Length(), SpanTypes.ExclusiveExclusive);
                    }
                    
                    // Add '(...)' if description exists
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
                    
                    if (i < maxItems - 1)
                    {
                        sb.Append("\n");
                    }
                }
                
                // Add indicator if there are more items
                if (todos.Count > maxItems)
                {
                    sb.Append($"\n\n+ {todos.Count - maxItems} more (tap to see all)");
                }
            }

            remoteViews.SetTextViewText(Resource.Id.widget_text, sb);

            // Create intent to launch app when widget is clicked
            var intent = new Intent(context, typeof(MainActivity));
            intent.SetFlags(ActivityFlags.NewTask | ActivityFlags.ClearTask);
            
            var flags = PendingIntentFlags.UpdateCurrent;
#pragma warning disable CA1416
            if (global::Android.OS.Build.VERSION.SdkInt >= global::Android.OS.BuildVersionCodes.M)
            {
                flags |= PendingIntentFlags.Immutable;
            }
#pragma warning restore CA1416
            
            var pendingIntent = PendingIntent.GetActivity(context, 0, intent, flags);
            remoteViews.SetOnClickPendingIntent(Resource.Id.widget_container, pendingIntent);

            appWidgetManager.UpdateAppWidget(appWidgetId, remoteViews);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error updating widget: {ex.Message}");
        }
    }

    public static void UpdateAllWidgets(Context context)
    {
        var appWidgetManager = AppWidgetManager.GetInstance(context);
        var componentName = new ComponentName(context, Java.Lang.Class.FromType(typeof(TodoWidgetProvider)));
        var appWidgetIds = appWidgetManager?.GetAppWidgetIds(componentName);
        
        if (appWidgetIds != null)
        {
            foreach (var id in appWidgetIds)
            {
                UpdateAppWidget(context, appWidgetManager!, id);
            }
        }
    }
}
