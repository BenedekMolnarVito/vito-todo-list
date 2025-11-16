using Android.Content;
using AndroidX.Work;
using Java.Util.Concurrent;

namespace VitoTodoList.Platforms.Android.BackgroundJobs;

/// <summary>
/// Schedules and manages the daily backup job using Android WorkManager.
/// </summary>
public static class BackupScheduler
{
    private const string BackupWorkTag = "daily_backup_work";
    private const string BackupWorkName = "daily_backup";

    /// <summary>
    /// Schedules the daily backup to run at 3 AM every day.
    /// </summary>
    public static void ScheduleDailyBackup(Context context)
    {
        try
        {
            // Calculate initial delay to next 3 AM
            var now = DateTime.Now;
            var next3AM = DateTime.Today.AddHours(3);
            
            if (now.Hour >= 3)
            {
                // If it's already past 3 AM today, schedule for tomorrow
                next3AM = next3AM.AddDays(1);
            }

            var initialDelay = next3AM - now;
            System.Diagnostics.Debug.WriteLine($"BackupScheduler: Scheduling backup with initial delay of {initialDelay.TotalMinutes:F0} minutes");

            // Create constraints: require network connectivity
            var constraints = new Constraints.Builder()
                .SetRequiredNetworkType(NetworkType.Connected)
                .Build();

            // Create periodic work request - runs every 24 hours
            var backupRequestBuilder = PeriodicWorkRequest.Builder.From<DailyBackupWorker>(
                24, // Repeat interval
                Java.Util.Concurrent.TimeUnit.Hours!);
            
            backupRequestBuilder.SetInitialDelay(initialDelay.Ticks / TimeSpan.TicksPerMillisecond, TimeUnit.Milliseconds!);
            backupRequestBuilder.SetConstraints(constraints);
            backupRequestBuilder.AddTag(BackupWorkTag);
            backupRequestBuilder.SetBackoffCriteria(
                BackoffPolicy.Exponential!,
                300, // Initial backoff delay
                TimeUnit.Minutes!);
            
            var backupRequest = backupRequestBuilder.Build();

            // Enqueue the work
            var workManager = WorkManager.GetInstance(context);
            workManager?.EnqueueUniquePeriodicWork(
                BackupWorkName,
                ExistingPeriodicWorkPolicy.Keep!, // Keep existing schedule if already scheduled
                (PeriodicWorkRequest)backupRequest);

            System.Diagnostics.Debug.WriteLine("BackupScheduler: Daily backup scheduled successfully");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"BackupScheduler: Failed to schedule backup - {ex.Message}");
        }
    }

    /// <summary>
    /// Cancels the scheduled daily backup.
    /// </summary>
    public static void CancelDailyBackup(Context context)
    {
        try
        {
            var workManager = WorkManager.GetInstance(context);
            workManager?.CancelUniqueWork(BackupWorkName);
            System.Diagnostics.Debug.WriteLine("BackupScheduler: Daily backup cancelled");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"BackupScheduler: Failed to cancel backup - {ex.Message}");
        }
    }

    /// <summary>
    /// Triggers an immediate backup (for testing or manual trigger).
    /// </summary>
    public static void TriggerImmediateBackup(Context context)
    {
        try
        {
            var constraints = new Constraints.Builder()
                .SetRequiredNetworkType(NetworkType.Connected)
                .Build();

            var backupRequest = new OneTimeWorkRequest.Builder(typeof(DailyBackupWorker))
                .SetConstraints(constraints)
                .AddTag("immediate_backup")
                .Build();

            var workManager = WorkManager.GetInstance(context);
            workManager?.Enqueue(backupRequest);

            System.Diagnostics.Debug.WriteLine("BackupScheduler: Immediate backup triggered");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"BackupScheduler: Failed to trigger immediate backup - {ex.Message}");
        }
    }

    /// <summary>
    /// Checks if the backup is currently scheduled.
    /// </summary>
    public static bool IsBackupScheduled(Context context)
    {
        try
        {
            var workManager = WorkManager.GetInstance(context);
            var workInfoFuture = workManager?.GetWorkInfosForUniqueWork(BackupWorkName);
            
            if (workInfoFuture != null)
            {
                var listObj = workInfoFuture.Get();
                if (listObj is Java.Util.IList list && list.Size() > 0)
                {
                    var workInfo = list.Get(0) as WorkInfo;
                    if (workInfo != null)
                    {
                        var state = workInfo.GetState();
                        return state == WorkInfo.State.Enqueued || state == WorkInfo.State.Running;
                    }
                }
            }
            
            return false;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"BackupScheduler: Failed to check backup status - {ex.Message}");
            return false;
        }
    }
}
