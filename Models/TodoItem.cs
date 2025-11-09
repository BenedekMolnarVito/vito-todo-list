using SQLite;

namespace VitoTodoList.Models;

[Table("TodoItems")]
public class TodoItem
{
    [PrimaryKey, AutoIncrement]
    public int Id { get; set; }

    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    public DateTime? Deadline { get; set; }

    public bool IsCompleted { get; set; }

    public int Order { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.Now;

    public DateTime? CompletedAt { get; set; }
}
