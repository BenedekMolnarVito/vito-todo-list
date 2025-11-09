using Android.App;
using Android.Appwidget;
using Android.Content;
using Android.Widget;
using VitoTodoList.Data;
using VitoTodoList.Models;

namespace VitoTodoList.Platforms.Android.Widgets
{
    [BroadcastReceiver(Label = "Todo Widget")]
    [IntentFilter(new string[] { "android.appwidget.action.APPWIDGET_UPDATE" })]
    [MetaData("android.appwidget.provider", Resource = "@xml/todo_widget_info")]
    public class TodoWidgetProvider : AppWidgetProvider
    {
        public override void OnUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds)
        {
            foreach (var appWidgetId in appWidgetIds)
            {
                UpdateWidget(context, appWidgetManager, appWidgetId);
            }
        }

        public static void UpdateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId)
        {
            var views = new RemoteViews(context.PackageName, Resource.Layout.todo_widget);

            try
            {
                string dbPath = Path.Combine(System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData), "todos.db3");
                var database = new TodoDatabase(dbPath);
                var todos = database.GetItemsAsync().Result;

                // Clear existing content
                views.RemoveAllViews(Resource.Id.widget_content);

                // Hide title as per requirements
                views.SetViewVisibility(Resource.Id.widget_title, global::Android.Views.ViewStates.Gone);

                if (todos.Count == 0)
                {
                    views.SetViewVisibility(Resource.Id.empty_view, global::Android.Views.ViewStates.Visible);
                }
                else
                {
                    views.SetViewVisibility(Resource.Id.empty_view, global::Android.Views.ViewStates.Gone);

                    foreach (var todo in todos.Take(10)) // Limit to 10 items for widget
                    {
                        var itemView = new RemoteViews(context.PackageName, Resource.Layout.widget_todo_item);
                        
                        // Format the text with bullet point and optional deadline
                        string itemText = $"• {todo.Title}";
                        
                        // Add deadline if exists
                        if (todo.Deadline.HasValue)
                        {
                            var deadline = todo.Deadline.Value;
                            itemText += $" - {deadline:MMM dd, HH:mm}";
                        }
                        
                        // Set text color based on whether it has a deadline
                        if (todo.Deadline.HasValue)
                        {
                            // Create a text with red deadline
                            var spannable = new global::Android.Text.SpannableString(itemText);
                            int deadlineStart = itemText.IndexOf(" - ");
                            if (deadlineStart > 0)
                            {
                                spannable.SetSpan(
                                    new global::Android.Text.Style.ForegroundColorSpan(global::Android.Graphics.Color.ParseColor("#F44336")),
                                    deadlineStart,
                                    itemText.Length,
                                    global::Android.Text.SpanTypes.ExclusiveExclusive
                                );
                            }
                            itemView.SetTextViewText(Resource.Id.todo_item_text, spannable);
                        }
                        else
                        {
                            itemView.SetTextViewText(Resource.Id.todo_item_text, itemText);
                            itemView.SetTextColor(Resource.Id.todo_item_text, global::Android.Graphics.Color.ParseColor("#212121"));
                        }
                        
                        views.AddView(Resource.Id.widget_content, itemView);
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Widget update error: {ex.Message}");
                views.SetTextViewText(Resource.Id.empty_view, "Error loading todos");
                views.SetViewVisibility(Resource.Id.empty_view, global::Android.Views.ViewStates.Visible);
            }

            appWidgetManager.UpdateAppWidget(appWidgetId, views);
        }
    }
}
