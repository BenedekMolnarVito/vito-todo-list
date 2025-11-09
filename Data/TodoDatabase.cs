using SQLite;
using VitoTodoList.Models;

namespace VitoTodoList.Data
{
    /// <summary>
    /// SQLite database for storing todo items
    /// </summary>
    public class TodoDatabase
    {
        private readonly SQLiteAsyncConnection _database;

        public TodoDatabase(string dbPath)
        {
            _database = new SQLiteAsyncConnection(dbPath);
            _database.CreateTableAsync<TodoItem>().Wait();
        }

        public Task<List<TodoItem>> GetItemsAsync()
        {
            return _database.Table<TodoItem>()
                .OrderBy(x => x.DisplayOrder)
                .ThenByDescending(x => x.CreatedAt)
                .ToListAsync();
        }

        public Task<TodoItem> GetItemAsync(int id)
        {
            return _database.Table<TodoItem>()
                .Where(i => i.Id == id)
                .FirstOrDefaultAsync();
        }

        public Task<int> SaveItemAsync(TodoItem item)
        {
            if (item.Id != 0)
            {
                return _database.UpdateAsync(item);
            }
            else
            {
                return _database.InsertAsync(item);
            }
        }

        public Task<int> DeleteItemAsync(TodoItem item)
        {
            return _database.DeleteAsync(item);
        }

        public async Task UpdateDisplayOrdersAsync(List<TodoItem> items)
        {
            for (int i = 0; i < items.Count; i++)
            {
                items[i].DisplayOrder = i;
                await _database.UpdateAsync(items[i]);
            }
        }
    }
}
