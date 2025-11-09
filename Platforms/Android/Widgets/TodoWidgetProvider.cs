using Android.App;
using Android.Appwidget;
using Android.Content;
using Android.Widget;
using VitoTodoList.Data;
using System.Text;

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
            
            var sb = new StringBuilder();
            var itemCount = Math.Min(todos.Count, maxItems);
            
            if (todos.Count == 0)
            {
                sb.AppendLine("No todos yet!");
            }
            else
            {
                for (int i = 0; i < itemCount; i++)
                {
                    var todo = todos[i];
                    var status = todo.IsCompleted ? "✓" : "○";
                    var title = todo.Title.Length > 30 ? todo.Title.Substring(0, 27) + "..." : todo.Title;
                    sb.AppendLine($"{status} {title}");
                }
                
                if (todos.Count > maxItems)
                {
                    sb.AppendLine($"... and {todos.Count - maxItems} more");
                }
            }

            remoteViews.SetTextViewText(Resource.Id.widget_text, sb.ToString().TrimEnd());

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
