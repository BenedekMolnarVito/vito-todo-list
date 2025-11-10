using SQLite;
using VitoTodoList.Models;

namespace VitoTodoList.Data;

/// <summary>
/// Database access layer for TodoItem using SQLite
/// </summary>
public class TodoDatabase
{
    private SQLiteAsyncConnection? _database;

    public async Task InitAsync()
    {
        if (_database != null)
            return;

        var dbPath = Path.Combine(FileSystem.AppDataDirectory, "todos.db3");
        _database = new SQLiteAsyncConnection(dbPath);
        await _database.CreateTableAsync<TodoItem>();
    }

    public async Task<List<TodoItem>> GetItemsAsync()
    {
        await InitAsync();
        return await _database!.Table<TodoItem>()
            .OrderBy(x => x.Order)
            .ThenByDescending(x => x.CreatedAt)
            .ToListAsync();
    }

    public async Task<TodoItem?> GetItemAsync(int id)
    {
        await InitAsync();
        return await _database!.Table<TodoItem>()
            .Where(x => x.Id == id)
            .FirstOrDefaultAsync();
    }

    public async Task<int> SaveItemAsync(TodoItem item)
    {
        await InitAsync();
        
        if (item.Id != 0)
        {
            return await _database!.UpdateAsync(item);
        }
        else
        {
            // Set order to the beginning of the list (top)
            var items = await _database!.Table<TodoItem>()
                .OrderBy(x => x.Order)
                .ToListAsync();
            var minOrder = items.FirstOrDefault()?.Order ?? 0;
            item.Order = minOrder - 1;
            return await _database!.InsertAsync(item);
        }
    }

    public async Task<int> DeleteItemAsync(TodoItem item)
    {
        await InitAsync();
        return await _database!.DeleteAsync(item);
    }

    public async Task<int> UpdateOrderAsync(List<TodoItem> items)
    {
        await InitAsync();
        var count = 0;
        for (int i = 0; i < items.Count; i++)
        {
            items[i].Order = i;
            count += await _database!.UpdateAsync(items[i]);
        }
        return count;
    }
}
