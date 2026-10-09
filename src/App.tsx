/**
 * App.tsx — root: React Router v6 + DB bootstrap + executor factory.
 *
 * Routes:
 *   /           → TodoListPage
 *   /add        → TodoEditPage (add)
 *   /edit/:id   → TodoEditPage (edit)
 *
 * Executor factory pattern (plan §4/§5):
 *   - createExecutor() returns a SqliteExecutor suitable for the current env.
 *   - In the browser/web build: uses an in-memory shim so the app RUNS in the
 *     browser without crashing (no native plugin available).
 *   - On Android (Capacitor native platform): uses the real
 *     @capacitor-community/sqlite plugin backed by a real on-device SQLite file.
 *   - App.tsx is the ONLY file that imports @capacitor/* directly (besides
 *     TodoEditPage's back button listener).
 *
 * DB is bootstrapped (initDatabase) once on mount before rendering pages.
 *
 * On-device DB path: /data/data/app.servimus.vitotodolist/databases/vito_todosSQLite.db
 * (the @capacitor-community/sqlite v8 plugin appends "SQLite.db" to the DB name).
 */
import { useState, useEffect, type CSSProperties } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";
import { DB_NAME, initDatabase } from "./data/DatabaseService.js";
import type { SqliteExecutor } from "./data/SqliteExecutor.js";
import { TodoListPage } from "./components/TodoListPage.js";
import { TodoEditPage } from "./components/TodoEditPage.js";
import { useTodos } from "./hooks/useTodos.js";
import { YELLOW_BACKGROUND } from "./components/TodoRow.js";

// ---------------------------------------------------------------------------
// Executor factory — Phase 5: real device executor on native, shim on web.
// ---------------------------------------------------------------------------

/**
 * Creates a SqliteExecutor backed by @capacitor-community/sqlite.
 * Used on-device (Android) where the real SQLite file lives.
 * Returns a Promise because createConnection / open are async.
 */
async function createDeviceExecutor(): Promise<SqliteExecutor> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);

  // Check if connection already exists (survive hot-reload / StrictMode double-mount)
  const { result: alreadyConnected } = await sqlite.isConnection(DB_NAME, false);
  const db = alreadyConnected
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);

  await db.open();

  const exec: SqliteExecutor = {
    async execute(sql: string): Promise<void> {
      await db.execute(sql, true);
    },
    async run(
      sql: string,
      params?: unknown[]
    ): Promise<{ changes: number; lastId: number }> {
      const res = await db.run(sql, params as (string | number | null)[] | undefined, true);
      return {
        changes: res.changes?.changes ?? 0,
        lastId: res.changes?.lastId ?? 0,
      };
    },
    async query<T>(
      sql: string,
      params?: unknown[]
    ): Promise<T[]> {
      const res = await db.query(sql, params as (string | number | null)[] | undefined);
      return (res.values ?? []) as T[];
    },
  };

  return exec;
}

/**
 * Web/browser shim executor.
 * Used in browser dev server, jsdom tests, and any non-native environment.
 * Intentionally minimal — enough to let the app boot without crashing.
 */
function createWebShimExecutor(): SqliteExecutor {
  // Simple in-memory SQLite shim using better-sqlite3-style API stubs.
  // For the web browser build + jsdom tests we provide just enough
  // to let the app bootstrap without crashing.
  const rows: Map<string, Record<string, unknown>[]> = new Map();

  const exec: SqliteExecutor = {
    async execute(sql: string): Promise<void> {
      // DDL: CREATE TABLE — just register the table name
      const match = /CREATE TABLE IF NOT EXISTS (\w+)/i.exec(sql);
      if (match?.[1] !== undefined && !rows.has(match[1])) {
        rows.set(match[1], []);
      }
    },
    async run(
      sql: string,
      params?: unknown[]
    ): Promise<{ changes: number; lastId: number }> {
      void sql;
      void params;
      return { changes: 0, lastId: 0 };
    },
    async query<T>(
      sql: string,
      params?: unknown[]
    ): Promise<T[]> {
      void sql;
      void params;
      return [];
    },
  };

  return exec;
}

/**
 * Factory: picks the right executor for the current environment.
 * - Native Android → real @capacitor-community/sqlite device executor
 * - Browser / jsdom → in-memory shim
 */
async function createExecutor(): Promise<SqliteExecutor> {
  if (Capacitor.isNativePlatform()) {
    return createDeviceExecutor();
  }
  return createWebShimExecutor();
}

// ---------------------------------------------------------------------------
// TodoListWrapper — connects useTodos hook to TodoListPage props
// ---------------------------------------------------------------------------
interface TodoListWrapperProps {
  exec: SqliteExecutor;
}

function TodoListWrapper({ exec }: TodoListWrapperProps): JSX.Element {
  const {
    todos,
    loading,
    toggleComplete,
    remove,
    reorder,
    exportJson,
    importJson,
  } = useTodos({ exec });

  return (
    <TodoListPage
      todos={todos}
      loading={loading}
      onToggleComplete={toggleComplete}
      onRemove={remove}
      onReorder={reorder}
      onExportJson={exportJson}
      onImportJson={importJson}
    />
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const initStyle: CSSProperties = {
  minHeight: "100vh",
  backgroundColor: YELLOW_BACKGROUND,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "sans-serif",
  color: "#F57F17",
  fontSize: "18px",
};

export function App(): JSX.Element {
  const [exec, setExec] = useState<SqliteExecutor | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // DB bootstrap on mount: create executor then init schema
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const e = await createExecutor();
        if (cancelled) return;
        await initDatabase(e);
        if (cancelled) return;
        setExec(e);
        setReady(true);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(`DB init failed: ${msg}`);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error !== null) {
    return <div style={initStyle}>{error}</div>;
  }

  if (!ready || exec === null) {
    return <div style={initStyle}>Initializing…</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TodoListWrapper exec={exec} />} />
        <Route path="/add" element={<TodoEditPage exec={exec} />} />
        <Route path="/edit/:id" element={<TodoEditPage exec={exec} />} />
      </Routes>
    </BrowserRouter>
  );
}
