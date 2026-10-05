package app.servimus.vitotodolist.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import android.widget.RemoteViews
import app.servimus.vitotodolist.MainActivity
import app.servimus.vitotodolist.R

/**
 * TodoWidgetProvider — AppWidgetProvider for the VitoTodoList home-screen widget.
 *
 * Ported ~1:1 from MAUI TodoWidgetProvider.cs:
 *  - onUpdate: sets up RemoteAdapter (collection via TodoWidgetService) +
 *    tap-to-open PendingIntent → MainActivity + item-click fill-intent template.
 *  - onReceive: handles APPWIDGET_UPDATE broadcast.
 *
 * On-device SQLite DB: /data/data/app.servimus.vitotodolist/databases/vito_todosSQLite.db
 * (the @capacitor-community/sqlite v8 plugin appends "SQLite.db" to the DB name "vito_todos").
 */
class TodoWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == AppWidgetManager.ACTION_APPWIDGET_UPDATE) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(
                ComponentName(context, TodoWidgetProvider::class.java)
            )
            onUpdate(context, appWidgetManager, appWidgetIds)
        }
    }

    companion object {
        private const val TAG = "TodoWidgetProvider"

        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            try {
                val remoteViews = RemoteViews(context.packageName, R.layout.todo_widget)

                // Set up the RemoteAdapter intent for the ListView
                val serviceIntent = Intent(context, TodoWidgetService::class.java).apply {
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                    // Unique data URI so Android treats different widget instances as distinct
                    data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
                }
                remoteViews.setRemoteAdapter(R.id.widget_list, serviceIntent)

                // Set up tap-to-open PendingIntent → MainActivity
                val clickIntent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                } else {
                    PendingIntent.FLAG_UPDATE_CURRENT
                }
                val clickPendingIntent = PendingIntent.getActivity(context, 0, clickIntent, flags)

                // Empty-view tap → also opens the app
                remoteViews.setOnClickPendingIntent(R.id.empty_view, clickPendingIntent)

                // Item-click template for the list (fill intent set per-item in the Factory)
                remoteViews.setPendingIntentTemplate(R.id.widget_list, clickPendingIntent)

                appWidgetManager.updateAppWidget(appWidgetId, remoteViews)
                // Trigger a data refresh so the Factory.onDataSetChanged() is called
                appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_list)
            } catch (e: Exception) {
                Log.e(TAG, "Error updating widget: ${e.message}", e)
            }
        }

        /** Called after an app mutation to refresh all widget instances. */
        fun updateAllWidgets(context: Context) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(
                ComponentName(context, TodoWidgetProvider::class.java)
            )
            val intent = Intent(context, TodoWidgetProvider::class.java).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, appWidgetIds)
            }
            context.sendBroadcast(intent)
        }
    }
}
