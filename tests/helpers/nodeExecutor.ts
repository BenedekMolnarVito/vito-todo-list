/**
 * nodeExecutor — wraps better-sqlite3 behind the SqliteExecutor interface
 * so repository tests can run against a real in-memory SQLite DB without
 * importing @capacitor-community/sqlite.
 *
 * Lives in tests/ ONLY.  src/ must NOT import better-sqlite3.
 */
import Database from "better-sqlite3";
import type { SqliteExecutor } from "../../src/data/SqliteExecutor.js";

/**
 * Creates a fresh in-memory SQLite DB and returns a SqliteExecutor backed
 * by it, plus a close() function for afterEach teardown.
 */
export function createNodeExecutor(): {
  exec: SqliteExecutor;
  close: () => void;
} {
  const db = new Database(":memory:");

  const exec: SqliteExecutor = {
    run(
      sql: string,
      params: unknown[] = []
    ): Promise<{ lastId: number; changes: number }> {
      const stmt = db.prepare(sql);
      const info = stmt.run(params);
      return Promise.resolve({
        lastId: Number(info.lastInsertRowid),
        changes: info.changes,
      });
    },

    query<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = []
    ): Promise<T[]> {
      const stmt = db.prepare(sql);
      const rows = stmt.all(params) as T[];
      return Promise.resolve(rows);
    },

    execute(sql: string): Promise<void> {
      db.exec(sql);
      return Promise.resolve();
    },
  };

  return { exec, close: () => db.close() };
}
