using Android.Content;
using AndroidX.Work;
using VitoTodoList.Data;
using VitoTodoList.Services;

namespace VitoTodoList.Platforms.Android.BackgroundJobs;

/// <summary>
/// WorkManager worker that performs daily backup of todos to Google Drive.
/// Scheduled to run at 3 AM daily.
/// </summary>
public class DailyBackupWorker : Worker
{
    public DailyBackupWorker(Context context, WorkerParameters workerParams) 
        : base(context, workerParams)
    {
    }

    public override Result DoWork()
    {
        try
        {
            System.Diagnostics.Debug.WriteLine("DailyBackupWorker: Starting daily backup job");

            // Run the async work synchronously (Worker requires sync DoWork method)
            var task = PerformBackupAsync();
            task.Wait();

            if (task.Result)
            {
                System.Diagnostics.Debug.WriteLine("DailyBackupWorker: Backup completed successfully");
                return Result.InvokeSuccess();
            }
            else
            {
                System.Diagnostics.Debug.WriteLine("DailyBackupWorker: Backup failed, will retry");
                return Result.InvokeRetry();
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"DailyBackupWorker: Exception occurred - {ex.Message}");
            return Result.InvokeRetry();
        }
    }

    private async Task<bool> PerformBackupAsync()
    {
        try
        {
            // Initialize services
            var database = new TodoDatabase();
            var exportService = new ExportImportService();
            var driveService = new GoogleDriveService();
            var queueService = new BackupQueueService();

            // Get all todos from database
            var items = await database.GetItemsAsync();
            
            // Export to JSON
            var json = await exportService.ExportToJsonAsync(items);
            
            // Create filename with timestamp
            var fileName = $"todos_backup_{DateTime.Now:yyyyMMdd_030000}.json";

            // Check if device has network connectivity
            var connectivity = Connectivity.Current;
            if (connectivity.NetworkAccess != NetworkAccess.Internet)
            {
                System.Diagnostics.Debug.WriteLine("DailyBackupWorker: No internet connection, queuing backup");
                await queueService.EnqueueBackupAsync(json, fileName, DateTime.Now);
                return false; // Will retry later
            }

            // Check if Google Drive is authenticated
            if (!driveService.IsAuthenticated())
            {
                System.Diagnostics.Debug.WriteLine("DailyBackupWorker: Not authenticated with Google Drive, queuing backup");
                await queueService.EnqueueBackupAsync(json, fileName, DateTime.Now);
                return false; // User needs to authenticate
            }

            // Try to upload to Google Drive
            var uploaded = await driveService.UploadBackupAsync(json, fileName);

            if (uploaded)
            {
                System.Diagnostics.Debug.WriteLine("DailyBackupWorker: Successfully uploaded to Google Drive");
                
                // Process any pending backups from the queue
                await ProcessQueuedBackupsAsync(driveService, queueService);
                
                return true;
            }
            else
            {
                System.Diagnostics.Debug.WriteLine("DailyBackupWorker: Upload failed, queuing backup");
                await queueService.EnqueueBackupAsync(json, fileName, DateTime.Now);
                return false;
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"DailyBackupWorker: Backup failed - {ex.Message}");
            return false;
        }
    }

    private async Task ProcessQueuedBackupsAsync(GoogleDriveService driveService, BackupQueueService queueService)
    {
        try
        {
            var pendingBackups = await queueService.GetPendingBackupsAsync();
            
            System.Diagnostics.Debug.WriteLine($"DailyBackupWorker: Processing {pendingBackups.Count} queued backups");

            foreach (var backup in pendingBackups.Take(5)) // Process up to 5 at a time
            {
                var uploaded = await driveService.UploadBackupAsync(backup.JsonContent, backup.FileName);
                
                if (uploaded)
                {
                    await queueService.MarkAsCompletedAsync(backup.Id);
                }
                else
                {
                    await queueService.MarkAsFailedAsync(backup.Id);
                }
            }

            // Cleanup old completed/failed backups
            await queueService.CleanupOldBackupsAsync();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"DailyBackupWorker: Failed to process queue - {ex.Message}");
        }
    }
}
