using System.Text.Json;
using VitoTodoList.Models;

namespace VitoTodoList.Services
{
    public static class ExportImportService
    {
        public static async Task<FileResult> ExportTodosAsync(List<TodoItem> todos)
        {
            var json = JsonSerializer.Serialize(todos, new JsonSerializerOptions { WriteIndented = true });
            var fileName = $"todos_{DateTime.Now:yyyyMMdd_HHmmss}.json";
            var filePath = Path.Combine(FileSystem.CacheDirectory, fileName);
            
            await File.WriteAllTextAsync(filePath, json);
            
            return new FileResult(filePath);
        }

        public static async Task<List<TodoItem>> ImportTodosAsync()
        {
            try
            {
                var result = await FilePicker.PickAsync(new PickOptions
                {
                    FileTypes = new FilePickerFileType(new Dictionary<DevicePlatform, IEnumerable<string>>
                    {
                        { DevicePlatform.Android, new[] { "application/json" } },
                        { DevicePlatform.iOS, new[] { "public.json" } },
                        { DevicePlatform.WinUI, new[] { ".json" } }
                    })
                });

                if (result != null)
                {
                    var json = await File.ReadAllTextAsync(result.FullPath);
                    var todos = JsonSerializer.Deserialize<List<TodoItem>>(json);
                    return todos;
                }
            }
            catch (Exception)
            {
                // User canceled or error occurred
            }

            return null;
        }
    }
}
