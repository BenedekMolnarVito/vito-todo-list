package app.servimus.vitotodolist.widget

import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.graphics.Color
import android.os.Build
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.StrikethroughSpan
import android.util.Log
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import app.servimus.vitotodolist.R
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * TodoWidgetFactory — RemoteViewsFactory for the VitoTodoList home-screen widget.
 *
 * Ported ~1:1 from MAUI TodoWidgetFactory.cs.
 *
 * Opens the SHARED on-device SQLite file READ-ONLY.
 * DB file: /data/data/app.servimus.vitotodolist/databases/vito_todosSQLite.db
 * (the @capacitor-community/sqlite v8 plugin appends "SQLite.db" to the DB name "vito_todos").
 *
 * Per-item rendering:
 *   - Checkbox: "✓" when completed, "•" when incomplete
 *   - Title: strikethrough span when completed; " (...)" appended when description is non-empty
 *   - Deadline: Hungarian relative-day format (ma / hétfő / kedd / szerda / csütörtök /
 *     péntek / szombat / vasárnap) for ≤7 days ahead; else "MMM dd".
 *     When time component is 00:00 → day name only; else "<day> HH:mm".
 *     Red foreground span applied to the whole deadline string.
 *   - Item click: fill intent (tap → MainActivity via PendingIntentTemplate in Provider)
 *
 * Query: SELECT ... FROM Todos ORDER BY "Order" ASC, CreatedAt DESC
 */
class TodoWidgetFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {

    companion object {
        private const val TAG = "TodoWidgetFactory"
        /** @capacitor-community/sqlite v8 appends "SQLite.db" to the DB name. */
        private const val DB_NAME = "vito_todosSQLite.db"
        private val ISO_FORMAT = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }
        private val ISO_FORMAT_ALT = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }
        private val ISO_FORMAT_LOCAL = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS", Locale.US)
        private val ISO_FORMAT_LOCAL_ALT = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
        private val MMM_DD_FORMAT = SimpleDateFormat("MMM dd", Locale.getDefault())
        private val HH_MM_FORMAT = SimpleDateFormat("HH:mm", Locale.getDefault())
    }

    // Data loaded on onDataSetChanged / onCreateLoaderInBackground
    private val todoItems = mutableListOf<TodoWidgetItem>()

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    override fun onCreate() {
        Log.d(TAG, "onCreate called")
        loadData()
    }

    override fun onDataSetChanged() {
        Log.d(TAG, "onDataSetChanged called")
        loadData()
    }

    override fun onDestroy() {
        todoItems.clear()
    }

    // -----------------------------------------------------------------------
    // Data access
    // -----------------------------------------------------------------------

    override fun getCount(): Int = todoItems.size

    override fun getItemId(position: Int): Long = position.toLong()

    override fun hasStableIds(): Boolean = true

    override fun getViewTypeCount(): Int = 1

    override fun getLoadingView(): RemoteViews? = null

    // -----------------------------------------------------------------------
    // View construction (mirrors TodoWidgetFactory.cs GetViewAt)
    // -----------------------------------------------------------------------

    override fun getViewAt(position: Int): RemoteViews? {
        if (position < 0 || position >= todoItems.size) return null

        return try {
            val item = todoItems[position]
            val rv = RemoteViews(context.packageName, R.layout.todo_widget_item)

            // --- Checkbox: ✓ completed / • incomplete ---
            rv.setTextViewText(R.id.item_checkbox, if (item.isCompleted) "✓" else "•")

            // --- Title: strikethrough when completed + " (...)" when description present ---
            val titleText = buildTitleText(item)
            val titleSpan = SpannableStringBuilder(titleText)
            if (item.isCompleted) {
                titleSpan.setSpan(
                    StrikethroughSpan(),
                    0,
                    titleText.length,
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
                )
            }
            rv.setTextViewText(R.id.item_title, titleSpan)

            // --- Deadline: Hungarian relative-day + red span ---
            val deadlineDate = item.deadline?.let { parseIsoDate(it) }
            if (deadlineDate != null) {
                val deadlineText = formatDeadline(deadlineDate)
                val deadlineSpan = SpannableStringBuilder(deadlineText)
                deadlineSpan.setSpan(
                    ForegroundColorSpan(Color.RED),
                    0,
                    deadlineText.length,
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
                )
                rv.setTextViewText(R.id.item_deadline, deadlineSpan)
                rv.setViewVisibility(R.id.item_deadline, android.view.View.VISIBLE)
            } else {
                rv.setViewVisibility(R.id.item_deadline, android.view.View.GONE)
            }

            // --- Fill intent for item click (template is set in Provider) ---
            val fillIntent = Intent()
            rv.setOnClickFillInIntent(R.id.item_container, fillIntent)

            rv
        } catch (e: Exception) {
            Log.e(TAG, "Error in getViewAt($position): ${e.message}", e)
            null
        }
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private fun buildTitleText(item: TodoWidgetItem): String {
        var title = item.title
        if (!item.description.isNullOrBlank()) {
            title += " (...)"
        }
        return title
    }

    /**
     * Hungarian relative-day deadline format, replicating TodoWidgetFactory.cs exactly:
     *
     *   - today → "ma"
     *   - 1–7 days ahead → Hungarian day name (hétfő/kedd/szerda/csütörtök/péntek/szombat/vasárnap)
     *   - more than 7 days → "MMM dd" (locale-formatted)
     *
     *   Time component:
     *   - 00:00 local → day name only
     *   - otherwise   → "<day> HH:mm"
     */
    private fun formatDeadline(deadline: Date): String {
        val now = Calendar.getInstance()
        val deadlineCal = Calendar.getInstance().apply { time = deadline }

        // Truncate to date for comparison
        val todayDate = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.time
        val deadlineDate = Calendar.getInstance().apply {
            time = deadline
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.time

        val daysDiff = ((deadlineDate.time - todayDate.time) / (1000L * 60 * 60 * 24)).toInt()

        // Is time component 00:00 local?
        val hour = deadlineCal.get(Calendar.HOUR_OF_DAY)
        val minute = deadlineCal.get(Calendar.MINUTE)
        val isTimeZero = (hour == 0 && minute == 0)

        val dayLabel: String = when {
            daysDiff == 0 -> "ma"
            daysDiff in 1..7 -> {
                when (deadlineCal.get(Calendar.DAY_OF_WEEK)) {
                    Calendar.MONDAY    -> "hétfő"
                    Calendar.TUESDAY   -> "kedd"
                    Calendar.WEDNESDAY -> "szerda"
                    Calendar.THURSDAY  -> "csütörtök"
                    Calendar.FRIDAY    -> "péntek"
                    Calendar.SATURDAY  -> "szombat"
                    Calendar.SUNDAY    -> "vasárnap"
                    else               -> MMM_DD_FORMAT.format(deadline)
                }
            }
            else -> MMM_DD_FORMAT.format(deadline)
        }

        return if (isTimeZero) {
            dayLabel
        } else {
            "$dayLabel ${HH_MM_FORMAT.format(deadline)}"
        }
    }

    /**
     * Parses ISO 8601 strings stored by the TypeScript layer.
     * Handles both UTC ("...Z") and local variants.
     */
    private fun parseIsoDate(iso: String): Date? {
        return try {
            // Try common formats in order
            val formats = listOf(ISO_FORMAT, ISO_FORMAT_ALT, ISO_FORMAT_LOCAL, ISO_FORMAT_LOCAL_ALT)
            for (fmt in formats) {
                try {
                    return fmt.parse(iso)
                } catch (_: Exception) { /* try next */ }
            }
            null
        } catch (e: Exception) {
            Log.w(TAG, "Cannot parse date: $iso — ${e.message}")
            null
        }
    }

    /**
     * Opens the shared SQLite file READ-ONLY and loads todos.
     * ORDER BY "Order" ASC, CreatedAt DESC — mirrors TodoDatabase.GetItemsAsync.
     */
    private fun loadData() {
        todoItems.clear()
        val dbPath = context.getDatabasePath(DB_NAME).absolutePath
        Log.d(TAG, "Opening DB read-only: $dbPath")

        var db: SQLiteDatabase? = null
        try {
            db = SQLiteDatabase.openDatabase(
                dbPath,
                null,
                SQLiteDatabase.OPEN_READONLY
            )
            val cursor = db.rawQuery(
                """SELECT Id, Title, Description, Deadline, IsCompleted
                   FROM Todos
                   ORDER BY "Order" ASC, CreatedAt DESC""",
                null
            )
            cursor.use { c ->
                while (c.moveToNext()) {
                    val idIdx = c.getColumnIndex("Id")
                    val titleIdx = c.getColumnIndex("Title")
                    val descIdx = c.getColumnIndex("Description")
                    val deadlineIdx = c.getColumnIndex("Deadline")
                    val completedIdx = c.getColumnIndex("IsCompleted")

                    todoItems.add(
                        TodoWidgetItem(
                            id = if (idIdx >= 0) c.getLong(idIdx) else 0L,
                            title = if (titleIdx >= 0) c.getString(titleIdx) ?: "" else "",
                            description = if (descIdx >= 0) c.getString(descIdx) else null,
                            deadline = if (deadlineIdx >= 0) c.getString(deadlineIdx) else null,
                            isCompleted = if (completedIdx >= 0) c.getInt(completedIdx) != 0 else false
                        )
                    )
                }
            }
            Log.d(TAG, "Loaded ${todoItems.size} todos from DB")
        } catch (e: Exception) {
            Log.e(TAG, "Error loading todos: ${e.message}", e)
            // DB may not exist yet (app not yet run); show empty widget silently
        } finally {
            db?.close()
        }
    }
}

/**
 * Simple data class mirroring the Todos table columns needed by the widget.
 */
data class TodoWidgetItem(
    val id: Long,
    val title: String,
    val description: String?,
    val deadline: String?,
    val isCompleted: Boolean
)
