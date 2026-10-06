/**
 * DatabaseService tests (TDD — written before the implementation was verified).
 *
 * Verifies:
 *   - initDatabase is idempotent (call twice, no error, table present)
 *   - The "Order" column is correctly quoted and usable
 *   - clearAll empties the Todos table
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createNodeExecutor } from "../helpers/nodeExecutor.js";
import { initDatabase, clearAll } from "../../src/data/DatabaseService.js";
import type { SqliteExecutor } from "../../src/data/SqliteExecutor.js";

describe("DatabaseService", () => {
  let exec: SqliteExecutor;
  let close: () => void;

  beforeEach(async () => {
    ({ exec, close } = createNodeExecutor());
    await initDatabase(exec);
  });

  afterEach(() => {
    close();
  });

  it("initDatabase creates the Todos table", async () => {
    // If the table does not exist, this query would throw
    const rows = await exec.query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM Todos"
    );
    expect(rows[0]?.count).toBe(0);
  });

  it("initDatabase is idempotent — calling it twice does not throw", async () => {
    // Should not throw
    await expect(initDatabase(exec)).resolves.toBeUndefined();
    // Table still queryable
    const rows = await exec.query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM Todos"
    );
    expect(rows[0]?.count).toBe(0);
  });

  it('"Order" column is correctly quoted and accepts writes', async () => {
    // Insert a row using the quoted "Order" column
    await exec.run(
      `INSERT INTO Todos (Title, IsCompleted, "Order", CreatedAt)
       VALUES (?, 0, ?, ?)`,
      ["test", 5, new Date().toISOString()]
    );
    const rows = await exec.query<{ Order: number }>(
      `SELECT "Order" FROM Todos LIMIT 1`
    );
    expect(rows[0]?.Order).toBe(5);
  });

  it("clearAll deletes all rows from Todos", async () => {
    // Insert two rows
    for (let i = 0; i < 2; i++) {
      await exec.run(
        `INSERT INTO Todos (Title, IsCompleted, "Order", CreatedAt)
         VALUES (?, 0, ?, ?)`,
        [`todo ${i}`, i, new Date().toISOString()]
      );
    }
    // Confirm rows inserted
    const before = await exec.query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM Todos"
    );
    expect(before[0]?.count).toBe(2);

    // Clear
    await clearAll(exec);

    const after = await exec.query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM Todos"
    );
    expect(after[0]?.count).toBe(0);
  });
});
