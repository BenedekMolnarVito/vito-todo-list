using Android.App;
using Android.Appwidget;
using Android.Content;
using Android.Widget;
using Android.OS;
using Android.Text;
using Android.Text.Style;
using System;
using System.Threading.Tasks;
using VitoTodoList.Data;

namespace VitoTodoList.Platforms.Android.Widgets
{
    [BroadcastReceiver(Label = "Todo List Widget", Exported = true)]
    [IntentFilter(new string[] { "android.appwidget.action.APPWIDGET_UPDATE" })]
    [MetaData("android.appwidget.provider", Resource = "@xml/todo_widget_info")]
    public class TodoWidgetProvider : AppWidgetProvider
    {
        public override void OnUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds)
        {
            foreach (var appWidgetId in appWidgetIds)
            {
                UpdateAppWidget(context, appWidgetManager, appWidgetId);
            }
        }

        private async void UpdateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId)
        {
            try
            {
                var remoteViews = new RemoteViews(context.PackageName, Resource.Layout.todo_widget);

                // Set up the intent for the ListView
                var intent = new Intent(context, typeof(TodoWidgetService));
                intent.PutExtra(AppWidgetManager.ExtraAppwidgetId, appWidgetId);
                intent.SetData(global::Android.Net.Uri.Parse(intent.ToUri(IntentUriType.Scheme)));
                remoteViews.SetRemoteAdapter(Resource.Id.widget_list, intent);

                // Set up the click intent to open the app
                var clickIntent = new Intent(context, typeof(MainActivity));
                clickIntent.SetFlags(ActivityFlags.NewTask | ActivityFlags.ClearTop);
                
                var flags = PendingIntentFlags.UpdateCurrent;
                if (Build.VERSION.SdkInt >= BuildVersionCodes.M)
                    flags |= PendingIntentFlags.Immutable;
                
                var clickPendingIntent = PendingIntent.GetActivity(context, 0, clickIntent, flags);
                remoteViews.SetOnClickPendingIntent(Resource.Id.empty_view, clickPendingIntent);
                
                // Set pending intent template for list items
                remoteViews.SetPendingIntentTemplate(Resource.Id.widget_list, clickPendingIntent);

                // Check if we have todos to show/hide empty view
                var database = new Data.TodoDatabase();
                await database.InitAsync();
                var todos = await database.GetItemsAsync();
                
                if (todos.Count == 0)
                {
                    remoteViews.SetViewVisibility(Resource.Id.empty_view, global::Android.Views.ViewStates.Visible);
                    remoteViews.SetViewVisibility(Resource.Id.widget_list, global::Android.Views.ViewStates.Gone);
                }
                else
                {
                    remoteViews.SetViewVisibility(Resource.Id.empty_view, global::Android.Views.ViewStates.Gone);
                    remoteViews.SetViewVisibility(Resource.Id.widget_list, global::Android.Views.ViewStates.Visible);
                }

                appWidgetManager.UpdateAppWidget(appWidgetId, remoteViews);
                appWidgetManager.NotifyAppWidgetViewDataChanged(appWidgetId, Resource.Id.widget_list);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error updating widget: {ex.Message}");
            }
        }

        public override void OnReceive(Context context, Intent intent)
        {
            base.OnReceive(context, intent);
            
            if (intent.Action == "android.appwidget.action.APPWIDGET_UPDATE")
            {
                var appWidgetManager = AppWidgetManager.GetInstance(context);
                var appWidgetIds = appWidgetManager.GetAppWidgetIds(new ComponentName(context, Java.Lang.Class.FromType(typeof(TodoWidgetProvider))));
                OnUpdate(context, appWidgetManager, appWidgetIds);
            }
        }

        public static void UpdateAllWidgets(Context context)
        {
            var appWidgetManager = AppWidgetManager.GetInstance(context);
            var appWidgetIds = appWidgetManager.GetAppWidgetIds(new ComponentName(context, Java.Lang.Class.FromType(typeof(TodoWidgetProvider))));
            
            var intent = new Intent(context, typeof(TodoWidgetProvider));
            intent.SetAction(AppWidgetManager.ActionAppwidgetUpdate);
            intent.PutExtra(AppWidgetManager.ExtraAppwidgetIds, appWidgetIds);
            context.SendBroadcast(intent);
        }
    }
}
