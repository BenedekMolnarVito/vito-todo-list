using VitoTodoList.Data;
using VitoTodoList.Models;
using VitoTodoList.Services;

namespace VitoTodoList.Tests.Integration;

/// <summary>
/// Integration tests that validate end-to-end workflows combining multiple components
/// </summary>
public class TodoWorkflowTests : IDisposable
{
    private readonly TodoDatabase _database;
    private readonly ExportImportService _exportService;
    private readonly string _testDbPath;
    private readonly string _testExportPath;

    public TodoWorkflowTests()
    {
        _testDbPath = Path.Combine(Path.GetTempPath(), $"integration_test_{Guid.NewGuid()}.db3");
        _testExportPath = Path.Combine(Path.GetTempPath(), $"integration_export_{Guid.NewGuid()}.json");
        _database = new TodoDatabase(_testDbPath);
        _exportService = new ExportImportService();
    }

    public void Dispose()
    {
        if (File.Exists(_testDbPath))
            File.Delete(_testDbPath);
        if (File.Exists(_testExportPath))
            File.Delete(_testExportPath);
    }

    [Fact]
    public async Task CompleteWorkflow_CreateEditCompleteDelete_ShouldWorkCorrectly()
    {
        // Step 1: Create a new todo item
        var newItem = new TodoItem
        {
            Title = "Buy groceries",
            Description = "Milk, eggs, bread",
            Deadline = DateTime.Now.AddDays(1)
        };
        await _database.SaveItemAsync(newItem);

        // Step 2: Verify it was saved at the top
        var items = await _database.GetItemsAsync();
        Assert.Single(items);
        var savedItem = items[0];
        Assert.Equal("Buy groceries", savedItem.Title);
        Assert.Equal("Milk, eggs, bread", savedItem.Description);

        // Step 3: Edit the item
        savedItem.Title = "Buy groceries (updated)";
        savedItem.Description = "Milk, eggs, bread, butter";
        await _database.SaveItemAsync(savedItem);

        // Step 4: Verify the edit
        var updatedItem = await _database.GetItemAsync(savedItem.Id);
        Assert.NotNull(updatedItem);
        Assert.Equal("Buy groceries (updated)", updatedItem.Title);
        Assert.Equal("Milk, eggs, bread, butter", updatedItem.Description);

        // Step 5: Mark as completed
        updatedItem.IsCompleted = true;
        updatedItem.CompletedAt = DateTime.Now;
        await _database.SaveItemAsync(updatedItem);

        // Step 6: Verify completion
        var completedItem = await _database.GetItemAsync(savedItem.Id);
        Assert.NotNull(completedItem);
        Assert.True(completedItem.IsCompleted);
        Assert.NotNull(completedItem.CompletedAt);

        // Step 7: Delete the item
        await _database.DeleteItemAsync(completedItem);

        // Step 8: Verify deletion
        var allItems = await _database.GetItemsAsync();
        Assert.Empty(allItems);
    }

    [Fact]
    public async Task ReorderWorkflow_MultipleItems_ShouldMaintainNewOrder()
    {
        // Step 1: Create multiple items
        var item1 = new TodoItem { Title = "First" };
        var item2 = new TodoItem { Title = "Second" };
        var item3 = new TodoItem { Title = "Third" };

        await _database.SaveItemAsync(item1);
        await _database.SaveItemAsync(item2);
        await _database.SaveItemAsync(item3);

        // Step 2: Verify they're added to top (reverse order)
        var items = await _database.GetItemsAsync();
        Assert.Equal(3, items.Count);
        Assert.Equal("Third", items[0].Title);
        Assert.Equal("Second", items[1].Title);
        Assert.Equal("First", items[2].Title);

        // Step 3: Reorder items (move first to last)
        items.Reverse();
        await _database.UpdateOrderAsync(items);

        // Step 4: Verify new order
        var reorderedItems = await _database.GetItemsAsync();
        Assert.Equal("First", reorderedItems[0].Title);
        Assert.Equal("Second", reorderedItems[1].Title);
        Assert.Equal("Third", reorderedItems[2].Title);
    }

    [Fact]
    public async Task ExportImportWorkflow_FullCycle_ShouldPreserveAllData()
    {
        // Step 1: Create test data with various states
        var items = new List<TodoItem>
        {
            new TodoItem 
            { 
                Title = "Completed Task",
                Description = "This is done",
                IsCompleted = true,
                CompletedAt = DateTime.Now.AddDays(-1)
            },
            new TodoItem 
            { 
                Title = "Upcoming Task",
                Description = "This has a deadline",
                Deadline = DateTime.Now.AddDays(7)
            },
            new TodoItem 
            { 
                Title = "Simple Task",
                Description = null
            }
        };

        foreach (var item in items)
        {
            await _database.SaveItemAsync(item);
        }

        // Step 2: Export to file
        var allItems = await _database.GetItemsAsync();
        var exportResult = await _exportService.ExportToFileAsync(allItems, _testExportPath);
        Assert.True(exportResult);
        Assert.True(File.Exists(_testExportPath));

        // Step 3: Clear database
        foreach (var item in allItems)
        {
            await _database.DeleteItemAsync(item);
        }
        var emptyItems = await _database.GetItemsAsync();
        Assert.Empty(emptyItems);

        // Step 4: Import from file
        var importedItems = await _exportService.ImportFromFileAsync(_testExportPath);
        Assert.NotNull(importedItems);
        Assert.Equal(3, importedItems.Count);

        // Step 5: Save imported items
        foreach (var item in importedItems)
        {
            item.Id = 0; // Reset ID for new entries
            await _database.SaveItemAsync(item);
        }

        // Step 6: Verify all data preserved
        var finalItems = await _database.GetItemsAsync();
        Assert.Equal(3, finalItems.Count);

        var completedTask = finalItems.FirstOrDefault(x => x.Title == "Completed Task");
        Assert.NotNull(completedTask);
        Assert.True(completedTask.IsCompleted);
        Assert.Equal("This is done", completedTask.Description);

        var upcomingTask = finalItems.FirstOrDefault(x => x.Title == "Upcoming Task");
        Assert.NotNull(upcomingTask);
        Assert.NotNull(upcomingTask.Deadline);
        Assert.Equal("This has a deadline", upcomingTask.Description);

        var simpleTask = finalItems.FirstOrDefault(x => x.Title == "Simple Task");
        Assert.NotNull(simpleTask);
        Assert.Null(simpleTask.Description);
    }

    [Fact]
    public async Task MultipleItemsWorkflow_AddingToTop_ShouldMaintainCorrectOrder()
    {
        // This tests the fix for "always add new items to the top"
        // Step 1: Add items one by one
        for (int i = 1; i <= 5; i++)
        {
            var item = new TodoItem { Title = $"Item {i}" };
            await _database.SaveItemAsync(item);

            // Step 2: Verify the latest item is at top
            var items = await _database.GetItemsAsync();
            Assert.Equal(i, items.Count);
            Assert.Equal($"Item {i}", items[0].Title);
        }

        // Step 3: Final verification - items should be in reverse insertion order
        var finalItems = await _database.GetItemsAsync();
        Assert.Equal(5, finalItems.Count);
        Assert.Equal("Item 5", finalItems[0].Title);
        Assert.Equal("Item 4", finalItems[1].Title);
        Assert.Equal("Item 3", finalItems[2].Title);
        Assert.Equal("Item 2", finalItems[3].Title);
        Assert.Equal("Item 1", finalItems[4].Title);
    }

    [Fact]
    public async Task CompletionToggleWorkflow_MultipleToggles_ShouldUpdateCorrectly()
    {
        // This tests the fix for checkbox check/uncheck bug
        // Step 1: Create an item
        var item = new TodoItem { Title = "Toggle Test" };
        await _database.SaveItemAsync(item);
        var savedItem = (await _database.GetItemsAsync())[0];

        // Step 2: Mark as completed
        savedItem.IsCompleted = true;
        savedItem.CompletedAt = DateTime.Now;
        await _database.SaveItemAsync(savedItem);

        var completedItem = await _database.GetItemAsync(savedItem.Id);
        Assert.NotNull(completedItem);
        Assert.True(completedItem.IsCompleted);
        Assert.NotNull(completedItem.CompletedAt);

        // Step 3: Unmark completion
        completedItem.IsCompleted = false;
        completedItem.CompletedAt = null;
        await _database.SaveItemAsync(completedItem);

        var uncompletedItem = await _database.GetItemAsync(savedItem.Id);
        Assert.NotNull(uncompletedItem);
        Assert.False(uncompletedItem.IsCompleted);
        Assert.Null(uncompletedItem.CompletedAt);

        // Step 4: Mark as completed again
        uncompletedItem.IsCompleted = true;
        uncompletedItem.CompletedAt = DateTime.Now;
        await _database.SaveItemAsync(uncompletedItem);

        var recompletedItem = await _database.GetItemAsync(savedItem.Id);
        Assert.NotNull(recompletedItem);
        Assert.True(recompletedItem.IsCompleted);
        Assert.NotNull(recompletedItem.CompletedAt);
    }

    [Fact]
    public async Task LargeDatasetWorkflow_50Items_ShouldPerformWell()
    {
        // This tests the fix for performance issues with many items
        var startTime = DateTime.Now;

        // Step 1: Create 50 items
        for (int i = 1; i <= 50; i++)
        {
            var item = new TodoItem
            {
                Title = $"Item {i}",
                Description = $"Description for item {i}",
                Deadline = i % 3 == 0 ? DateTime.Now.AddDays(i) : null,
                IsCompleted = i % 5 == 0
            };
            await _database.SaveItemAsync(item);
        }

        // Step 2: Retrieve all items (should be fast)
        var items = await _database.GetItemsAsync();
        Assert.Equal(50, items.Count);

        // Step 3: Update an item in the middle
        var middleItem = items[25];
        middleItem.Title = "Updated Middle Item";
        await _database.SaveItemAsync(middleItem);

        // Step 4: Verify update
        var updatedItem = await _database.GetItemAsync(middleItem.Id);
        Assert.NotNull(updatedItem);
        Assert.Equal("Updated Middle Item", updatedItem.Title);

        // Step 5: Reorder items (simulate drag-drop)
        items.Reverse();
        await _database.UpdateOrderAsync(items);

        // Step 6: Verify new order
        var reorderedItems = await _database.GetItemsAsync();
        Assert.Equal("Item 1", reorderedItems[0].Title);

        var elapsed = DateTime.Now - startTime;
        // All operations should complete in reasonable time (< 5 seconds)
        Assert.True(elapsed.TotalSeconds < 5, $"Operations took too long: {elapsed.TotalSeconds}s");
    }
}
