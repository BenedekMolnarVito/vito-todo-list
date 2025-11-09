using Android.Appwidget;
using Android.Content;

namespace VitoTodoList.Platforms.Android.Widgets
{
    public static class WidgetUpdateHelper
    {
        public static void UpdateWidget(global::Android.App.Activity activity)
        {
            if (activity == null) return;

            var context = activity.ApplicationContext;
            var appWidgetManager = AppWidgetManager.GetInstance(context);
            var componentName = new ComponentName(context, Java.Lang.Class.FromType(typeof(TodoWidgetProvider)));
            var appWidgetIds = appWidgetManager.GetAppWidgetIds(componentName);

            if (appWidgetIds != null && appWidgetIds.Length > 0)
            {
                foreach (var appWidgetId in appWidgetIds)
                {
                    TodoWidgetProvider.UpdateWidget(context, appWidgetManager, appWidgetId);
                }
            }
        }
    }
}
