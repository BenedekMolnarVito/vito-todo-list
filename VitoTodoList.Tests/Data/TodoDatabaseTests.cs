using VitoTodoList.Data;
using VitoTodoList.Models;

namespace VitoTodoList.Tests.Data;

public class TodoDatabaseTests : IDisposable
{
    private readonly TodoDatabase _database;
    private readonly string _testDbPath;

    public TodoDatabaseTests()
    {
        // Create a unique database for each test
        _testDbPath = Path.Combine(Path.GetTempPath(), $"test_todos_{Guid.NewGuid()}.db3");
        _database = new TodoDatabase(_testDbPath);
    }

    public void Dispose()
    {
        // Clean up test database
        if (File.Exists(_testDbPath))
        {
            File.Delete(_testDbPath);
        }
    }

    [Fact]
    public async Task SaveItemAsync_NewItem_ShouldAddToTop()
    {
        // Arrange
        var item1 = new TodoItem { Title = "First Item" };
        var item2 = new TodoItem { Title = "Second Item" };

        // Act
        await _database.SaveItemAsync(item1);
        await _database.SaveItemAsync(item2);
        var items = await _database.GetItemsAsync();

        // Assert
        Assert.Equal(2, items.Count);
        Assert.Equal("Second Item", items[0].Title); // Most recent should be first
        Assert.True(items[0].Order < items[1].Order); // Second item should have lower order
    }

    [Fact]
    public async Task SaveItemAsync_ExistingItem_ShouldUpdate()
    {
        // Arrange
        var item = new TodoItem { Title = "Original Title" };
        await _database.SaveItemAsync(item);

        // Act
        var savedItem = (await _database.GetItemsAsync())[0];
        savedItem.Title = "Updated Title";
        await _database.SaveItemAsync(savedItem);

        // Assert
        var items = await _database.GetItemsAsync();
        Assert.Single(items);
        Assert.Equal("Updated Title", items[0].Title);
    }

    [Fact]
    public async Task GetItemAsync_ExistingId_ShouldReturnItem()
    {
        // Arrange
        var item = new TodoItem { Title = "Test Item" };
        await _database.SaveItemAsync(item);
        var savedItem = (await _database.GetItemsAsync())[0];

        // Act
        var retrievedItem = await _database.GetItemAsync(savedItem.Id);

        // Assert
        Assert.NotNull(retrievedItem);
        Assert.Equal("Test Item", retrievedItem.Title);
    }

    [Fact]
    public async Task GetItemAsync_NonExistingId_ShouldReturnNull()
    {
        // Act
        var item = await _database.GetItemAsync(99999);

        // Assert
        Assert.Null(item);
    }

    [Fact]
    public async Task DeleteItemAsync_ShouldRemoveItem()
    {
        // Arrange
        var item = new TodoItem { Title = "To Be Deleted" };
        await _database.SaveItemAsync(item);
        var savedItem = (await _database.GetItemsAsync())[0];

        // Act
        await _database.DeleteItemAsync(savedItem);
        var items = await _database.GetItemsAsync();

        // Assert
        Assert.Empty(items);
    }

    [Fact]
    public async Task UpdateOrderAsync_ShouldPreserveNewOrder()
    {
        // Arrange
        var item1 = new TodoItem { Title = "Item 1" };
        var item2 = new TodoItem { Title = "Item 2" };
        var item3 = new TodoItem { Title = "Item 3" };
        await _database.SaveItemAsync(item1);
        await _database.SaveItemAsync(item2);
        await _database.SaveItemAsync(item3);

        // Act - Reverse the order
        var items = await _database.GetItemsAsync();
        items.Reverse();
        await _database.UpdateOrderAsync(items);

        // Assert
        var reorderedItems = await _database.GetItemsAsync();
        Assert.Equal("Item 1", reorderedItems[0].Title);
        Assert.Equal("Item 2", reorderedItems[1].Title);
        Assert.Equal("Item 3", reorderedItems[2].Title);
    }

    [Fact]
    public async Task GetItemsAsync_EmptyDatabase_ShouldReturnEmptyList()
    {
        // Act
        var items = await _database.GetItemsAsync();

        // Assert
        Assert.NotNull(items);
        Assert.Empty(items);
    }

    [Fact]
    public async Task SaveItemAsync_WithDeadline_ShouldPersistDeadline()
    {
        // Arrange
        var deadline = DateTime.Now.AddDays(7);
        var item = new TodoItem 
        { 
            Title = "Item with Deadline",
            Deadline = deadline
        };

        // Act
        await _database.SaveItemAsync(item);
        var savedItem = (await _database.GetItemsAsync())[0];

        // Assert
        Assert.NotNull(savedItem.Deadline);
        Assert.Equal(deadline.Date, savedItem.Deadline.Value.Date);
    }

    [Fact]
    public async Task SaveItemAsync_CompletedItem_ShouldPersistCompletionData()
    {
        // Arrange
        var completedAt = DateTime.Now;
        var item = new TodoItem 
        { 
            Title = "Completed Item",
            IsCompleted = true,
            CompletedAt = completedAt
        };

        // Act
        await _database.SaveItemAsync(item);
        var savedItem = (await _database.GetItemsAsync())[0];

        // Assert
        Assert.True(savedItem.IsCompleted);
        Assert.NotNull(savedItem.CompletedAt);
        Assert.Equal(completedAt.Date, savedItem.CompletedAt.Value.Date);
    }
}
