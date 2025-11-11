using System.Text.Json;
using VitoTodoList.Models;

namespace VitoTodoList.Services;

public class ExportImportService
{
    public Task<string> ExportToJsonAsync(List<TodoItem> items)
    {
        var json = JsonSerializer.Serialize(items, new JsonSerializerOptions
        {
            WriteIndented = true
        });
        return Task.FromResult(json);
    }

    public Task<List<TodoItem>?> ImportFromJsonAsync(string json)
    {
        try
        {
            var items = JsonSerializer.Deserialize<List<TodoItem>>(json);
            // Reverse the order of imported items
            if (items != null)
            {
                items.Reverse();
            }
            return Task.FromResult(items);
        }
        catch
        {
            return Task.FromResult<List<TodoItem>?>(null);
        }
    }

    public async Task<bool> ExportToFileAsync(List<TodoItem> items, string filePath)
    {
        try
        {
            var json = await ExportToJsonAsync(items);
            await File.WriteAllTextAsync(filePath, json);
            return true;
        }
        catch
        {
            return false;
        }
    }

    public async Task<List<TodoItem>?> ImportFromFileAsync(string filePath)
    {
        try
        {
            var json = await File.ReadAllTextAsync(filePath);
            return await ImportFromJsonAsync(json);
        }
        catch
        {
            return null;
        }
    }
}
