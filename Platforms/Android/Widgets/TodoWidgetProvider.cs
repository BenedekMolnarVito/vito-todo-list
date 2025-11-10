using Android.App;
using Android.Appwidget;
using Android.Content;
using Android.Views;
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
            
            if (todos.Count == 0)
            {
                // Show empty state
                remoteViews.SetViewVisibility(Resource.Id.widget_list, ViewStates.Gone);
                remoteViews.SetViewVisibility(Resource.Id.widget_empty, ViewStates.Visible);
            }
            else
            {
                // Show list view
                remoteViews.SetViewVisibility(Resource.Id.widget_list, ViewStates.Visible);
                remoteViews.SetViewVisibility(Resource.Id.widget_empty, ViewStates.Gone);

                // Set up the intent that starts the RemoteViewsService for the ListView
                var intent = new Intent(context, typeof(TodoWidgetService));
                intent.PutExtra(AppWidgetManager.ExtraAppwidgetId, appWidgetId);
                intent.SetData(global::Android.Net.Uri.Parse(intent.ToUri(IntentUriType.Scheme)!));
                
#pragma warning disable CA1422
                remoteViews.SetRemoteAdapter(Resource.Id.widget_list, intent);
#pragma warning restore CA1422
            }

            // Create intent to launch app when widget container is clicked
            var launchIntent = new Intent(context, typeof(MainActivity));
            launchIntent.SetFlags(ActivityFlags.NewTask | ActivityFlags.ClearTask);
            
            var flags = PendingIntentFlags.UpdateCurrent;
#pragma warning disable CA1416
            if (global::Android.OS.Build.VERSION.SdkInt >= global::Android.OS.BuildVersionCodes.M)
            {
                flags |= PendingIntentFlags.Immutable;
            }
#pragma warning restore CA1416
            
            var pendingIntent = PendingIntent.GetActivity(context, 0, launchIntent, flags);
            remoteViews.SetOnClickPendingIntent(Resource.Id.widget_container, pendingIntent);

            // Set up click handling for list items
            var clickIntentTemplate = new Intent(context, typeof(MainActivity));
            clickIntentTemplate.SetFlags(ActivityFlags.NewTask | ActivityFlags.ClearTask);
            var clickPendingIntentTemplate = PendingIntent.GetActivity(context, 0, clickIntentTemplate, flags);
            remoteViews.SetPendingIntentTemplate(Resource.Id.widget_list, clickPendingIntentTemplate);

            appWidgetManager.UpdateAppWidget(appWidgetId, remoteViews);
            
            // Notify the ListView to refresh its data
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
