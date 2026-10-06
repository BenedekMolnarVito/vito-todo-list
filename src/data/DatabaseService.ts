/**
 * DatabaseService — DDL bootstrapper for the vito_todos SQLite database.
 *
 * DB name "vito_todos" is shared with the native Kotlin widget (§6 of the
 * rework plan).  The widget opens the same file by name, so this constant
 * must remain stable.
 *
 * IMPORTANT: "Order" is a SQL reserved word and MUST always be quoted
 * as "Order" in every SQL statement that references it.
 */
import type { SqliteExecutor } from "./SqliteExecutor.js";

/** Shared DB name — consumed by DatabaseService and the Kotlin widget. */
export const DB_NAME = "vito_todos";

/**
 * Runs idempotent DDL to create the Todos table.
 * Safe to call multiple times (CREATE TABLE IF NOT EXISTS).
 *
 * Column mapping to MAUI TodoItem:
 *   Id          INTEGER PK AUTOINCREMENT
 *   Title       TEXT NOT NULL
 *   Description TEXT               (nullable)
 *   Deadline    TEXT               (nullable, ISO 8601)
 *   IsCompleted INTEGER NOT NULL DEFAULT 0   (0=false, 1=true)
 *   "Order"     INTEGER NOT NULL DEFAULT 0   (quoted — reserved word)
 *   CreatedAt   TEXT NOT NULL      (ISO 8601)
 *   CompletedAt TEXT               (nullable, ISO 8601)
 */
export async function initDatabase(exec: SqliteExecutor): Promise<void> {
  await exec.execute(`
    CREATE TABLE IF NOT EXISTS Todos (
      Id          INTEGER PRIMARY KEY AUTOINCREMENT,
      Title       TEXT    NOT NULL,
      Description TEXT,
      Deadline    TEXT,
      IsCompleted INTEGER NOT NULL DEFAULT 0,
      "Order"     INTEGER NOT NULL DEFAULT 0,
      CreatedAt   TEXT    NOT NULL,
      CompletedAt TEXT
    );
  `);
}

/**
 * Deletes all rows from Todos.  Used for test teardown and a future
 * "clear all" feature.
 */
export async function clearAll(exec: SqliteExecutor): Promise<void> {
  await exec.run("DELETE FROM Todos");
}
