using Android.App;
using Android.Appwidget;
using Android.Content;
using Android.Widget;
using VitoTodoList.Data;
using System.Text;
using Android.Text;
using Android.Text.Style;

namespace VitoTodoList.Platforms.Android.Widgets;

[BroadcastReceiver(Label = "Todo List Widget", Exported = true)]
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
            
            // Get widget size preferences
            var prefs = context.GetSharedPreferences("TodoWidget", FileCreationMode.Private);
            var maxItems = prefs?.GetInt($"widget_{appWidgetId}_maxItems", 5) ?? 5;

            // Build the widget content
            var remoteViews = new RemoteViews(context.PackageName, Resource.Layout.todo_widget);
            
            var sb = new SpannableStringBuilder();
            var itemCount = Math.Min(todos.Count, maxItems);
            
            if (todos.Count == 0)
            {
                sb.Append("No todos yet!");
            }
            else
            {
                for (int i = 0; i < itemCount; i++)
                {
                    var todo = todos[i];
                    // Use bullet point for each item
                    sb.Append("• ");
                    sb.Append(todo.Title);
                    
                    // Add deadline in red if it exists
                    if (todo.Deadline.HasValue)
                    {
                        var deadlineText = $" {todo.Deadline.Value:MMM dd, HH:mm}";
                        int start = sb.Length();
                        sb.Append(deadlineText);
                        sb.SetSpan(new ForegroundColorSpan(global::Android.Graphics.Color.Red), start, sb.Length(), SpanTypes.ExclusiveExclusive);
                    }
                    
                    if (i < itemCount - 1)
                    {
                        sb.Append("\n");
                    }
                }
                
                if (todos.Count > maxItems)
                {
                    sb.Append($"\n... and {todos.Count - maxItems} more");
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
