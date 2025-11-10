using VitoTodoList.Models;
using VitoTodoList.Services;

namespace VitoTodoList.Tests.Services;

public class ExportImportServiceTests : IDisposable
{
    private readonly ExportImportService _service;
    private readonly string _testFilePath;

    public ExportImportServiceTests()
    {
        _service = new ExportImportService();
        _testFilePath = Path.Combine(Path.GetTempPath(), $"test_export_{Guid.NewGuid()}.json");
    }

    public void Dispose()
    {
        if (File.Exists(_testFilePath))
        {
            File.Delete(_testFilePath);
        }
    }

    [Fact]
    public async Task ExportToJsonAsync_WithItems_ShouldReturnValidJson()
    {
        // Arrange
        var items = new List<TodoItem>
        {
            new TodoItem { Id = 1, Title = "Test Item 1", Description = "Description 1" },
            new TodoItem { Id = 2, Title = "Test Item 2", IsCompleted = true }
        };

        // Act
        var json = await _service.ExportToJsonAsync(items);

        // Assert
        Assert.NotNull(json);
        Assert.Contains("Test Item 1", json);
        Assert.Contains("Test Item 2", json);
        Assert.Contains("Description 1", json);
    }

    [Fact]
    public async Task ExportToJsonAsync_EmptyList_ShouldReturnEmptyArray()
    {
        // Arrange
        var items = new List<TodoItem>();

        // Act
        var json = await _service.ExportToJsonAsync(items);

        // Assert
        Assert.NotNull(json);
        Assert.Contains("[]", json);
    }

    [Fact]
    public async Task ImportFromJsonAsync_ValidJson_ShouldReturnItems()
    {
        // Arrange
        var json = @"[
            {
                ""Id"": 1,
                ""Title"": ""Test Item"",
                ""Description"": ""Test Description"",
                ""IsCompleted"": false,
                ""Order"": 0,
                ""CreatedAt"": ""2025-01-01T00:00:00""
            }
        ]";

        // Act
        var items = await _service.ImportFromJsonAsync(json);

        // Assert
        Assert.NotNull(items);
        Assert.Single(items);
        Assert.Equal("Test Item", items[0].Title);
        Assert.Equal("Test Description", items[0].Description);
    }

    [Fact]
    public async Task ImportFromJsonAsync_InvalidJson_ShouldReturnNull()
    {
        // Arrange
        var json = "{ invalid json }";

        // Act
        var items = await _service.ImportFromJsonAsync(json);

        // Assert
        Assert.Null(items);
    }

    [Fact]
    public async Task ExportToFileAsync_ValidPath_ShouldCreateFile()
    {
        // Arrange
        var items = new List<TodoItem>
        {
            new TodoItem { Id = 1, Title = "Test Item" }
        };

        // Act
        var result = await _service.ExportToFileAsync(items, _testFilePath);

        // Assert
        Assert.True(result);
        Assert.True(File.Exists(_testFilePath));
        var content = await File.ReadAllTextAsync(_testFilePath);
        Assert.Contains("Test Item", content);
    }

    [Fact]
    public async Task ImportFromFileAsync_ValidFile_ShouldReturnItems()
    {
        // Arrange
        var json = @"[{""Id"":1,""Title"":""Test Item"",""Description"":null,""Deadline"":null,""IsCompleted"":false,""Order"":0,""CreatedAt"":""2025-01-01T00:00:00"",""CompletedAt"":null}]";
        await File.WriteAllTextAsync(_testFilePath, json);

        // Act
        var items = await _service.ImportFromFileAsync(_testFilePath);

        // Assert
        Assert.NotNull(items);
        Assert.Single(items);
        Assert.Equal("Test Item", items[0].Title);
    }

    [Fact]
    public async Task ImportFromFileAsync_NonExistentFile_ShouldReturnNull()
    {
        // Act
        var items = await _service.ImportFromFileAsync("non_existent_file.json");

        // Assert
        Assert.Null(items);
    }

    [Fact]
    public async Task RoundTrip_ExportAndImport_ShouldPreserveData()
    {
        // Arrange
        var originalItems = new List<TodoItem>
        {
            new TodoItem 
            { 
                Id = 1, 
                Title = "Test Item", 
                Description = "Test Description",
                Deadline = DateTime.Parse("2025-12-31T23:59:59"),
                IsCompleted = false,
                Order = 1
            }
        };

        // Act
        var json = await _service.ExportToJsonAsync(originalItems);
        var importedItems = await _service.ImportFromJsonAsync(json);

        // Assert
        Assert.NotNull(importedItems);
        Assert.Single(importedItems);
        Assert.Equal(originalItems[0].Title, importedItems[0].Title);
        Assert.Equal(originalItems[0].Description, importedItems[0].Description);
        Assert.Equal(originalItems[0].IsCompleted, importedItems[0].IsCompleted);
        Assert.Equal(originalItems[0].Order, importedItems[0].Order);
    }

    [Fact]
    public async Task ExportToJsonAsync_WithSpecialCharacters_ShouldEscapeProperly()
    {
        // Arrange
        var items = new List<TodoItem>
        {
            new TodoItem { Id = 1, Title = "Test \"quoted\" & <special> chars" }
        };

        // Act
        var json = await _service.ExportToJsonAsync(items);

        // Assert
        Assert.NotNull(json);
        var importedItems = await _service.ImportFromJsonAsync(json);
        Assert.NotNull(importedItems);
        Assert.Equal("Test \"quoted\" & <special> chars", importedItems[0].Title);
    }
}
