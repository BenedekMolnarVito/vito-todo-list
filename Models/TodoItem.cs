using SQLite;

namespace VitoTodoList.Models
{
    public class TodoItem
    {
        [PrimaryKey, AutoIncrement]
        public int Id { get; set; }
        
        public string Title { get; set; } = string.Empty;
        
        public string? Description { get; set; }
        
        public bool IsCompleted { get; set; }
        
        public DateTime? Deadline { get; set; }
        
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        
        public int DisplayOrder { get; set; }
    }
}
