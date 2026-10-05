import { vi } from "vitest";

/**
 * Stub for @capacitor-community/sqlite used in non-Android environments
 * (unit tests, CI, browser dev builds). The real plugin is loaded from
 * node_modules in the Android WebView via the Capacitor runtime.
 */
export const CapacitorSQLite = {
  createConnection: vi.fn(),
  closeConnection: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  execute: vi.fn().mockResolvedValue({ changes: { changes: 0, lastId: 0 } }),
  query: vi.fn().mockResolvedValue({ values: [] }),
  run: vi.fn().mockResolvedValue({ changes: { changes: 0, lastId: 0 } }),
  isDatabase: vi.fn().mockResolvedValue({ result: false }),
  getDatabaseList: vi.fn().mockResolvedValue({ values: [] }),
  checkConnectionsConsistency: vi.fn().mockResolvedValue({ result: true }),
  isConnection: vi.fn().mockResolvedValue({ result: false }),
};

export class SQLiteConnection {
  checkConnectionsConsistency = vi.fn().mockResolvedValue({ result: true });
  isConnection = vi.fn().mockResolvedValue({ result: false });
  retrieveConnection = vi.fn();
  createConnection = vi.fn().mockResolvedValue({
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue({ changes: { changes: 0, lastId: 0 } }),
    query: vi.fn().mockResolvedValue({ values: [] }),
    run: vi.fn().mockResolvedValue({ changes: { changes: 0, lastId: 0 } }),
    isTable: vi.fn().mockResolvedValue({ result: false }),
  });
  closeConnection = vi.fn().mockResolvedValue(undefined);
}

export class SQLiteDBConnection {
  open = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
  execute = vi.fn().mockResolvedValue({ changes: { changes: 0, lastId: 0 } });
  query = vi.fn().mockResolvedValue({ values: [] });
  run = vi.fn().mockResolvedValue({ changes: { changes: 0, lastId: 0 } });
  isTable = vi.fn().mockResolvedValue({ result: false });
}
