using Android.Content;

namespace VitoTodoList.Platforms.Android.Widgets;

public static class WidgetUpdateHelper
{
    public static void UpdateWidgets()
    {
        try
        {
#if ANDROID
            var context = global::Android.App.Application.Context;
            if (context != null)
            {
                TodoWidgetProvider.UpdateAllWidgets(context);
            }
#endif
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error updating widgets: {ex.Message}");
        }
    }
}
