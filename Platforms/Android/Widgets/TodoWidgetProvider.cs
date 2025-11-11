using Android.App;
using Android.Appwidget;
using Android.Content;
using Android.Widget;
using VitoTodoList.Data;

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
            
            if (todos.Count == 0)
            {
                // Show empty state
                remoteViews.SetViewVisibility(Resource.Id.widget_list, global::Android.Views.ViewStates.Gone);
                remoteViews.SetViewVisibility(Resource.Id.widget_empty, global::Android.Views.ViewStates.Visible);
            }
            else
            {
                // Show list with data
                remoteViews.SetViewVisibility(Resource.Id.widget_list, global::Android.Views.ViewStates.Visible);
                remoteViews.SetViewVisibility(Resource.Id.widget_empty, global::Android.Views.ViewStates.Gone);
                
                // Set up the RemoteViewsService for the ListView
                var serviceIntent = new Intent(context, typeof(TodoWidgetService));
                serviceIntent.PutExtra(AppWidgetManager.ExtraAppwidgetId, appWidgetId);
                serviceIntent.SetData(global::Android.Net.Uri.Parse(serviceIntent.ToUri(global::Android.Content.IntentUriType.Scheme)!));
                
#pragma warning disable CA1422
                remoteViews.SetRemoteAdapter(Resource.Id.widget_list, serviceIntent);
#pragma warning restore CA1422
                
                // Set the empty view for the ListView
                remoteViews.SetEmptyView(Resource.Id.widget_list, Resource.Id.widget_empty);
            }

            // Create intent to launch app when widget header is clicked
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
            remoteViews.SetOnClickPendingIntent(Resource.Id.widget_header, pendingIntent);
            
            // Set up template intent for list item clicks
            var templateIntent = new Intent(context, typeof(MainActivity));
            templateIntent.SetFlags(ActivityFlags.NewTask | ActivityFlags.ClearTask);
            var clickPendingIntent = PendingIntent.GetActivity(context, 0, templateIntent, flags);
            remoteViews.SetPendingIntentTemplate(Resource.Id.widget_list, clickPendingIntent);

            appWidgetManager.UpdateAppWidget(appWidgetId, remoteViews);
            
            // Notify the AppWidgetManager to refresh the list data
#pragma warning disable CA1422
            appWidgetManager.NotifyAppWidgetViewDataChanged(appWidgetId, Resource.Id.widget_list);
#pragma warning restore CA1422
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
