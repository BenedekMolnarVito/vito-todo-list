package app.servimus.vitotodolist;

import app.servimus.vitotodolist.widget.TodoWidgetProvider;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /**
     * Refresh the home-screen widget whenever the app leaves the foreground, so
     * changes made in the app (add/edit/delete/reorder/import) show up in the
     * widget instead of waiting for the 30-minute updatePeriodMillis.
     */
    @Override
    public void onPause() {
        super.onPause();
        TodoWidgetProvider.updateAllWidgets(getApplicationContext());
    }
}
