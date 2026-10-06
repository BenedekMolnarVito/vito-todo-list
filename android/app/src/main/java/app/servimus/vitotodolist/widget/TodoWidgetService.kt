package app.servimus.vitotodolist.widget

import android.content.Intent
import android.util.Log
import android.widget.RemoteViewsService

/**
 * TodoWidgetService — RemoteViewsService for the VitoTodoList widget.
 *
 * Ported ~1:1 from MAUI TodoWidgetService.cs:
 *   Returns a TodoWidgetFactory instance to supply remote views for the
 *   widget's ListView collection.
 *
 * Registered in AndroidManifest.xml with BIND_REMOTEVIEWS permission.
 */
class TodoWidgetService : RemoteViewsService() {

    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        Log.d("TodoWidgetService", "onGetViewFactory called")
        return TodoWidgetFactory(applicationContext)
    }
}
