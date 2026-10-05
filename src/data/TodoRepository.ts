/**
 * TodoRepository — CRUD + ordering logic for the Todos table.
 *
 * Replicates MAUI Data/TodoDatabase.cs behaviour EXACTLY:
 *   - GetItemsAsync  → ORDER BY "Order" ASC, CreatedAt DESC
 *   - SaveItemAsync  (Id==0) → increment all existing "Order", insert at "Order"=0
 *   - UpdateOrderAsync → set "Order" = index for each id in the supplied sequence
 *   - LoadTodosAsync auto-complete → deadline <= now forces isCompleted=true + persists
 *
 * Every function takes exec: SqliteExecutor as the FIRST parameter (test
 * helper injects better-sqlite3; app injects the Capacitor plugin executor).
 *
 * "Order" is a SQL reserved word and is ALWAYS quoted in every statement.
 */
import type { SqliteExecutor } from "./SqliteExecutor.js";
import type { Todo } from "../models/Todo.js";

// ---------------------------------------------------------------------------
// Internal row type (DB column names, PascalCase, IsCompleted as 0|1)
// ---------------------------------------------------------------------------
interface TodoRow {
  Id: number;
  Title: string;
  Description: string | null;
  Deadline: string | null;
  IsCompleted: number; // 0 or 1
  Order: number;
  CreatedAt: string;
  CompletedAt: string | null;
}

// ---------------------------------------------------------------------------
// Row ↔ Model mappers
// ---------------------------------------------------------------------------
function rowToTodo(row: TodoRow): Todo {
  return {
    id: row.Id,
    title: row.Title,
    description: row.Description,
    deadline: row.Deadline,
    isCompleted: row.IsCompleted !== 0,
    order: row.Order,
    createdAt: row.CreatedAt,
    completedAt: row.CompletedAt,
  };
}

// ---------------------------------------------------------------------------
// SELECT column list (explicit, no SELECT *)
// ---------------------------------------------------------------------------
const SELECT_COLS = `Id, Title, Description, Deadline, IsCompleted, "Order", CreatedAt, CompletedAt`;

// ---------------------------------------------------------------------------
// isDeadlinePast — chronological "is this deadline at or before now?"
//
// MAUI parity: MainPage.xaml.cs did `Deadline.Value <= DateTime.Now`, i.e. a
// CHRONOLOGICAL compare in LOCAL time. A plain string `<=` is WRONG here: the
// app stores deadlines local-no-Z, minute-precision (`"2026-12-25T17:00"`, see
// useEditTodo `${date}T${time}`), while a UTC `toISOString()` now carries a `Z`
// and sub-second digits — so lexicographic `deadline <= now` compares mismatched
// formats and mis-fires near the boundary (e.g. 17:00 local deadline vs 15:30Z
// now reads as "not past" in CEST even though wall-clock is past-due).
//
// `new Date(s)` parses an ISO string with a `Z`/offset as absolute, and a
// local-no-Z string as LOCAL time — exactly the MAUI semantics for both the
// app's own values and Z-suffixed imported ones. Compare epoch millis instead.
// ---------------------------------------------------------------------------
function isDeadlinePast(deadline: string, nowMs: number): boolean {
  const deadlineMs = new Date(deadline).getTime();
  // Unparseable deadline → do NOT auto-complete (fail safe, mirrors MAUI's
  // null-guard which only acted on a valid DateTime).
  if (Number.isNaN(deadlineMs)) return false;
  return deadlineMs <= nowMs;
}

// ---------------------------------------------------------------------------
// getAllTodos
// Replicates MAUI GetItemsAsync + LoadTodosAsync:
//   1. SELECT … ORDER BY "Order" ASC, CreatedAt DESC
//   2. For each row: if deadline is non-null AND deadline is chronologically
//      past (see isDeadlinePast) → force isCompleted=true, set completedAt=now
//      if null, PERSIST the flip.
//   3. Return the post-flip list.
// ---------------------------------------------------------------------------
export async function getAllTodos(exec: SqliteExecutor): Promise<Todo[]> {
  const rows = await exec.query<TodoRow>(
    `SELECT ${SELECT_COLS} FROM Todos ORDER BY "Order" ASC, CreatedAt DESC`
  );

  const now = new Date().toISOString();
  const nowMs = Date.now();
  const result: Todo[] = [];

  for (const row of rows) {
    const todo = rowToTodo(row);

    // Auto-complete: deadline is chronologically past → force completed + persist
    if (
      todo.deadline !== null &&
      !todo.isCompleted &&
      isDeadlinePast(todo.deadline, nowMs)
    ) {
      const completedAt = now;
      await exec.run(
        `UPDATE Todos SET IsCompleted = 1, CompletedAt = ? WHERE Id = ?`,
        [completedAt, todo.id]
      );
      todo.isCompleted = true;
      todo.completedAt = completedAt;
    }

    result.push(todo);
  }

  return result;
}

// ---------------------------------------------------------------------------
// getTodoById
// ---------------------------------------------------------------------------
export async function getTodoById(
  exec: SqliteExecutor,
  id: number
): Promise<Todo | null> {
  const rows = await exec.query<TodoRow>(
    `SELECT ${SELECT_COLS} FROM Todos WHERE Id = ?`,
    [id]
  );
  const row = rows[0];
  return row !== undefined ? rowToTodo(row) : null;
}

// ---------------------------------------------------------------------------
// addTodo
// Replicates MAUI SaveItemAsync (Id==0 path):
//   1. Increment "Order" of ALL existing rows by 1
//   2. INSERT new row at "Order" = 0 (top)
//   Returns the new row's auto-assigned id.
// Any incoming id / order on the todo object is ignored.
// ---------------------------------------------------------------------------
export async function addTodo(
  exec: SqliteExecutor,
  todo: Omit<Todo, "id" | "order">
): Promise<number> {
  // Shift all existing rows down by 1
  await exec.run(`UPDATE Todos SET "Order" = "Order" + 1`);

  // Insert new row at top
  const result = await exec.run(
    `INSERT INTO Todos (Title, Description, Deadline, IsCompleted, "Order", CreatedAt, CompletedAt)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
    [
      todo.title,
      todo.description,
      todo.deadline,
      todo.isCompleted ? 1 : 0,
      todo.createdAt,
      todo.completedAt,
    ]
  );

  return result.lastId;
}

// ---------------------------------------------------------------------------
// updateTodo
// UPDATE all mutable columns by id.
// ---------------------------------------------------------------------------
export async function updateTodo(
  exec: SqliteExecutor,
  todo: Todo
): Promise<void> {
  await exec.run(
    `UPDATE Todos
     SET Title = ?, Description = ?, Deadline = ?, IsCompleted = ?, "Order" = ?, CreatedAt = ?, CompletedAt = ?
     WHERE Id = ?`,
    [
      todo.title,
      todo.description,
      todo.deadline,
      todo.isCompleted ? 1 : 0,
      todo.order,
      todo.createdAt,
      todo.completedAt,
      todo.id,
    ]
  );
}

// ---------------------------------------------------------------------------
// deleteTodo
// Hard DELETE by id (no soft-delete).
// ---------------------------------------------------------------------------
export async function deleteTodo(
  exec: SqliteExecutor,
  id: number
): Promise<void> {
  await exec.run(`DELETE FROM Todos WHERE Id = ?`, [id]);
}

// ---------------------------------------------------------------------------
// updateOrder
// Replicates MAUI UpdateOrderAsync:
//   for each id at index i, set "Order" = i.
// ---------------------------------------------------------------------------
export async function updateOrder(
  exec: SqliteExecutor,
  idsInOrder: number[]
): Promise<void> {
  for (let i = 0; i < idsInOrder.length; i++) {
    const id = idsInOrder[i];
    await exec.run(`UPDATE Todos SET "Order" = ? WHERE Id = ?`, [i, id]);
  }
}

// ---------------------------------------------------------------------------
// getAllForWidget
// Same query as getAllTodos but WITHOUT the auto-complete persist side-effect.
// The native Kotlin widget reads the same SQLite file directly and handles
// its own display logic — it does not expect the TypeScript layer to
// mutate the DB as a side-effect of a read.  We therefore return the raw
// ordered list here.
// ---------------------------------------------------------------------------
export async function getAllForWidget(exec: SqliteExecutor): Promise<Todo[]> {
  const rows = await exec.query<TodoRow>(
    `SELECT ${SELECT_COLS} FROM Todos ORDER BY "Order" ASC, CreatedAt DESC`
  );
  return rows.map(rowToTodo);
}
