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
 *   - In the browser/web build: uses an in-memory (better-sqlite3-like) shim
 *     via the CapacitorSQLite mock so the app RUNS in the browser.
 *   - Phase 5 finalizes the real @capacitor-community/sqlite device connection.
 *   - App.tsx is the ONLY file that imports @capacitor/* directly (besides
 *     TodoEditPage's back button listener).
 *
 * DB is bootstrapped (initDatabase) once on mount before rendering pages.
 */
import { useState, useEffect, type CSSProperties } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { initDatabase } from "./data/DatabaseService.js";
import type { SqliteExecutor } from "./data/SqliteExecutor.js";
import { TodoListPage } from "./components/TodoListPage.js";
import { TodoEditPage } from "./components/TodoEditPage.js";
import { useTodos } from "./hooks/useTodos.js";
import { YELLOW_BACKGROUND } from "./components/TodoRow.js";

// ---------------------------------------------------------------------------
// Executor factory — Phase 4: web/browser shim so the app runs in a browser.
// Phase 5 swaps this for the real @capacitor-community/sqlite device executor.
// ---------------------------------------------------------------------------

/**
 * Creates the SqliteExecutor for the current environment.
 *
 * In the browser build the @capacitor-community/sqlite plugin is not
 * functional (it needs a Capacitor WebView + native plugin). We use a
 * lightweight in-memory store backed by the mock so the app renders in a
 * browser. This shim is intentionally minimal — Phase 5 replaces it with
 * the real Capacitor executor.
 */
function createWebShimExecutor(): SqliteExecutor {
  // Simple in-memory SQLite shim using better-sqlite3-style API stubs.
  // For Phase 4 (web browser build + jsdom tests) we provide just enough
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
    shareExport,
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
      onShareExport={shareExport}
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
  const [exec] = useState<SqliteExecutor>(() => createWebShimExecutor());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // DB bootstrap on mount
  useEffect(() => {
    void initDatabase(exec)
      .then(() => { setReady(true); })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`DB init failed: ${msg}`);
      });
  }, [exec]);

  if (error !== null) {
    return <div style={initStyle}>{error}</div>;
  }

  if (!ready) {
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
