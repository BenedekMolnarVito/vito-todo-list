/**
 * SqliteExecutor — minimal abstraction so the same repository functions
 * work against:
 *   - @capacitor-community/sqlite  (on-device, async, real SQLite file)
 *   - better-sqlite3               (test-only, sync wrapped in Promise.resolve)
 *
 * Every method returns a Promise so the Capacitor plugin (truly async) and
 * the node driver (sync, wrapped) share the same interface without casting.
 *
 * src/ MUST NOT import better-sqlite3 — the node implementation lives
 * exclusively in tests/helpers/nodeExecutor.ts.
 */
export interface SqliteExecutor {
  /**
   * Execute a write statement (INSERT / UPDATE / DELETE / DDL).
   * Returns the lastInsertRowId and the number of affected rows.
   */
  run(
    sql: string,
    params?: unknown[]
  ): Promise<{ lastId: number; changes: number }>;

  /**
   * Execute a SELECT query and return rows typed as T.
   * Column names come back exactly as written in the SQL (alias them if needed).
   */
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T[]>;

  /**
   * Execute a batch of raw SQL (e.g. multi-statement DDL in a single string).
   * Used by DatabaseService.initDatabase.
   */
  execute(sql: string): Promise<void>;
}
