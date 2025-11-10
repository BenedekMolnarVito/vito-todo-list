using VitoTodoList.Models;

namespace VitoTodoList.Tests.Models;

public class TodoItemTests
{
    [Fact]
    public void TodoItem_DefaultValues_ShouldBeSetCorrectly()
    {
        // Act
        var item = new TodoItem();

        // Assert
        Assert.Equal(0, item.Id);
        Assert.Equal(string.Empty, item.Title);
        Assert.Null(item.Description);
        Assert.Null(item.Deadline);
        Assert.False(item.IsCompleted);
        Assert.Equal(0, item.Order);
        Assert.NotEqual(default(DateTime), item.CreatedAt);
        Assert.Null(item.CompletedAt);
    }

    [Fact]
    public void TodoItem_SetProperties_ShouldUpdateCorrectly()
    {
        // Arrange
        var deadline = DateTime.Now.AddDays(7);
        var completedAt = DateTime.Now;

        // Act
        var item = new TodoItem
        {
            Id = 1,
            Title = "Test Title",
            Description = "Test Description",
            Deadline = deadline,
            IsCompleted = true,
            Order = 5,
            CompletedAt = completedAt
        };

        // Assert
        Assert.Equal(1, item.Id);
        Assert.Equal("Test Title", item.Title);
        Assert.Equal("Test Description", item.Description);
        Assert.Equal(deadline, item.Deadline);
        Assert.True(item.IsCompleted);
        Assert.Equal(5, item.Order);
        Assert.Equal(completedAt, item.CompletedAt);
    }

    [Fact]
    public void TodoItem_CreatedAt_ShouldBeSetOnInstantiation()
    {
        // Arrange
        var before = DateTime.Now.AddSeconds(-1);

        // Act
        var item = new TodoItem();
        var after = DateTime.Now.AddSeconds(1);

        // Assert
        Assert.True(item.CreatedAt >= before && item.CreatedAt <= after);
    }

    [Fact]
    public void TodoItem_MarkComplete_ShouldUpdateFields()
    {
        // Arrange
        var item = new TodoItem { Title = "Test" };
        var completedAt = DateTime.Now;

        // Act
        item.IsCompleted = true;
        item.CompletedAt = completedAt;

        // Assert
        Assert.True(item.IsCompleted);
        Assert.Equal(completedAt, item.CompletedAt);
    }

    [Fact]
    public void TodoItem_UnmarkComplete_ShouldClearCompletedAt()
    {
        // Arrange
        var item = new TodoItem 
        { 
            Title = "Test",
            IsCompleted = true,
            CompletedAt = DateTime.Now
        };

        // Act
        item.IsCompleted = false;
        item.CompletedAt = null;

        // Assert
        Assert.False(item.IsCompleted);
        Assert.Null(item.CompletedAt);
    }
}
