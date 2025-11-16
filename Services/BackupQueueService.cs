using System.Text.Json;

namespace VitoTodoList.Services;

/// <summary>
/// Simple message queue for handling backup operations when the device is offline.
/// Stores pending backups and retries them when connectivity is restored.
/// </summary>
public class BackupQueueService
{
    private readonly string _queueFilePath;
    private const int MaxRetries = 5;

    public BackupQueueService()
    {
        _queueFilePath = Path.Combine(FileSystem.AppDataDirectory, "backup_queue.json");
    }

    /// <summary>
    /// Adds a backup job to the queue.
    /// </summary>
    public async Task EnqueueBackupAsync(string jsonContent, string fileName, DateTime scheduledTime)
    {
        try
        {
            var queue = await LoadQueueAsync();
            
            queue.Add(new BackupQueueItem
            {
                Id = Guid.NewGuid().ToString(),
                JsonContent = jsonContent,
                FileName = fileName,
                ScheduledTime = scheduledTime,
                EnqueuedTime = DateTime.Now,
                RetryCount = 0,
                Status = BackupStatus.Pending
            });

            await SaveQueueAsync(queue);
            System.Diagnostics.Debug.WriteLine($"BackupQueue: Enqueued backup {fileName}");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"BackupQueue: Failed to enqueue - {ex.Message}");
        }
    }

    /// <summary>
    /// Gets all pending backups from the queue.
    /// </summary>
    public async Task<List<BackupQueueItem>> GetPendingBackupsAsync()
    {
        var queue = await LoadQueueAsync();
        return queue.Where(x => x.Status == BackupStatus.Pending || x.Status == BackupStatus.Retrying)
                    .Where(x => x.RetryCount < MaxRetries)
                    .OrderBy(x => x.ScheduledTime)
                    .ToList();
    }

    /// <summary>
    /// Marks a backup as completed.
    /// </summary>
    public async Task MarkAsCompletedAsync(string id)
    {
        try
        {
            var queue = await LoadQueueAsync();
            var item = queue.FirstOrDefault(x => x.Id == id);
            
            if (item != null)
            {
                item.Status = BackupStatus.Completed;
                item.CompletedTime = DateTime.Now;
                await SaveQueueAsync(queue);
                System.Diagnostics.Debug.WriteLine($"BackupQueue: Marked {id} as completed");
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"BackupQueue: Failed to mark as completed - {ex.Message}");
        }
    }

    /// <summary>
    /// Marks a backup as failed and increments retry count.
    /// </summary>
    public async Task MarkAsFailedAsync(string id)
    {
        try
        {
            var queue = await LoadQueueAsync();
            var item = queue.FirstOrDefault(x => x.Id == id);
            
            if (item != null)
            {
                item.RetryCount++;
                item.Status = item.RetryCount >= MaxRetries ? BackupStatus.Failed : BackupStatus.Retrying;
                item.LastAttemptTime = DateTime.Now;
                await SaveQueueAsync(queue);
                System.Diagnostics.Debug.WriteLine($"BackupQueue: Marked {id} as failed (retry {item.RetryCount}/{MaxRetries})");
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"BackupQueue: Failed to mark as failed - {ex.Message}");
        }
    }

    /// <summary>
    /// Cleans up old completed and failed backups (older than 7 days).
    /// </summary>
    public async Task CleanupOldBackupsAsync()
    {
        try
        {
            var queue = await LoadQueueAsync();
            var cutoffDate = DateTime.Now.AddDays(-7);
            
            var itemsToKeep = queue.Where(x => 
                x.Status == BackupStatus.Pending || 
                x.Status == BackupStatus.Retrying ||
                (x.CompletedTime.HasValue && x.CompletedTime.Value > cutoffDate)
            ).ToList();

            if (itemsToKeep.Count < queue.Count)
            {
                await SaveQueueAsync(itemsToKeep);
                System.Diagnostics.Debug.WriteLine($"BackupQueue: Cleaned up {queue.Count - itemsToKeep.Count} old items");
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"BackupQueue: Failed to cleanup - {ex.Message}");
        }
    }

    /// <summary>
    /// Gets the count of pending backups.
    /// </summary>
    public async Task<int> GetPendingCountAsync()
    {
        var pending = await GetPendingBackupsAsync();
        return pending.Count;
    }

    private async Task<List<BackupQueueItem>> LoadQueueAsync()
    {
        try
        {
            if (!File.Exists(_queueFilePath))
            {
                System.Diagnostics.Debug.WriteLine($"BackupQueue: Queue file not found at {_queueFilePath}, initializing new queue.");
                return new List<BackupQueueItem>();
            }

            var json = await File.ReadAllTextAsync(_queueFilePath);
            return JsonSerializer.Deserialize<List<BackupQueueItem>>(json) ?? new List<BackupQueueItem>();
        }
        catch
        {
            System.Diagnostics.Debug.WriteLine($"BackupQueue: Failed to load queue from {_queueFilePath}.");
            return new List<BackupQueueItem>();
        }
    }

    private async Task SaveQueueAsync(List<BackupQueueItem> queue)
    {
        var json = JsonSerializer.Serialize(queue, new JsonSerializerOptions { WriteIndented = true });
        await File.WriteAllTextAsync(_queueFilePath, json);
    }
}

public class BackupQueueItem
{
    public string Id { get; set; } = string.Empty;
    public string JsonContent { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public DateTime ScheduledTime { get; set; }
    public DateTime EnqueuedTime { get; set; }
    public DateTime? LastAttemptTime { get; set; }
    public DateTime? CompletedTime { get; set; }
    public int RetryCount { get; set; }
    public BackupStatus Status { get; set; }
}

public enum BackupStatus
{
    Pending,
    Retrying,
    Completed,
    Failed
}
