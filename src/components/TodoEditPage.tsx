/**
 * TodoEditPage — add/edit form.
 *
 * Uses useEditTodo hook. On save → navigate(-1). On cancel → navigate(-1).
 * Hardware back button on Android via @capacitor/app (guard for non-native).
 *
 * @capacitor/app import is only in this component (per plan constraints).
 */
import { useEffect, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useEditTodo } from "../hooks/useEditTodo.js";
import type { SqliteExecutor } from "../data/SqliteExecutor.js";
import {
  YELLOW_BACKGROUND,
  YELLOW_DARK,
  YELLOW_DEEP,
  YELLOW_LIGHT,
  YELLOW_MEDIUM,
} from "./TodoRow.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface TodoEditPageProps {
  exec: SqliteExecutor;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const pageStyle: CSSProperties = {
  minHeight: "100vh",
  backgroundColor: YELLOW_BACKGROUND,
  fontFamily: "sans-serif",
};

const headerStyle: CSSProperties = {
  backgroundColor: YELLOW_DARK,
  color: "#fff",
  padding: "16px",
};

const headerTitleStyle: CSSProperties = {
  fontSize: "20px",
  fontWeight: "bold",
  margin: 0,
};

const formStyle: CSSProperties = {
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const labelStyle: CSSProperties = {
  fontSize: "14px",
  fontWeight: "bold",
  color: YELLOW_DEEP,
  display: "block",
  marginBottom: "4px",
};

const inputStyle = (hasError: boolean): CSSProperties => ({
  width: "100%",
  padding: "10px",
  fontSize: "16px",
  border: `2px solid ${hasError ? "#e53935" : YELLOW_MEDIUM}`,
  borderRadius: "4px",
  backgroundColor: YELLOW_LIGHT,
  boxSizing: "border-box",
  outline: "none",
});

const textareaStyle: CSSProperties = {
  width: "100%",
  padding: "10px",
  fontSize: "16px",
  border: `2px solid ${YELLOW_MEDIUM}`,
  borderRadius: "4px",
  backgroundColor: YELLOW_LIGHT,
  boxSizing: "border-box",
  outline: "none",
  minHeight: "80px",
  resize: "vertical",
};

const errorStyle: CSSProperties = {
  color: "#e53935",
  fontSize: "12px",
  marginTop: "2px",
};

const checkboxRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  gap: "12px",
  paddingTop: "8px",
};

const saveButtonStyle: CSSProperties = {
  flex: 1,
  padding: "12px",
  backgroundColor: YELLOW_DARK,
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  fontSize: "16px",
  fontWeight: "bold",
  cursor: "pointer",
};

const cancelButtonStyle: CSSProperties = {
  flex: 1,
  padding: "12px",
  backgroundColor: "#ccc",
  color: "#333",
  border: "none",
  borderRadius: "6px",
  fontSize: "16px",
  cursor: "pointer",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TodoEditPage({ exec }: TodoEditPageProps): JSX.Element {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const id = params.id !== undefined ? parseInt(params.id, 10) : undefined;

  const {
    title,
    description,
    hasDeadline,
    date,
    time,
    errors,
    setTitle,
    setDescription,
    setHasDeadline,
    setDate,
    setTime,
    save,
  } = useEditTodo({ exec, ...(id !== undefined ? { id } : {}) });

  // Wire @capacitor/app hardware back button (Android only, guard for web)
  useEffect(() => {
    let removeListener: (() => void) | undefined;

    void (async () => {
      try {
        // Dynamic import — only in this file (plan constraint)
        const { App: CapApp } = await import("@capacitor/app");
        const handle = await CapApp.addListener("backButton", () => {
          void navigate(-1);
        });
        removeListener = () => { void handle.remove(); };
      } catch {
        // Not running in Capacitor WebView — ignore
      }
    })();

    return () => {
      removeListener?.();
    };
  }, [navigate]);

  async function handleSave(): Promise<void> {
    const ok = await save();
    if (ok) {
      void navigate(-1);
    }
  }

  function handleCancel(): void {
    void navigate(-1);
  }

  const isEdit = id !== undefined;

  return (
    <div style={pageStyle} data-testid="todo-edit-page">
      <div style={headerStyle}>
        <h1 style={headerTitleStyle}>{isEdit ? "Edit Todo" : "Add Todo"}</h1>
      </div>

      <div style={formStyle}>
        {/* Title */}
        <div>
          <label style={labelStyle} htmlFor="title-input">
            Title *
          </label>
          <input
            id="title-input"
            data-testid="title-input"
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); }}
            style={inputStyle(errors.title)}
            placeholder="What needs to be done?"
            maxLength={200}
            aria-invalid={errors.title}
            aria-describedby={errors.title ? "title-error" : undefined}
          />
          {errors.title && (
            <span id="title-error" style={errorStyle}>
              Title is required (max 200 characters).
            </span>
          )}
        </div>

        {/* Description */}
        <div>
          <label style={labelStyle} htmlFor="description-input">
            Description
          </label>
          <textarea
            id="description-input"
            data-testid="description-input"
            value={description}
            onChange={(e) => { setDescription(e.target.value); }}
            style={textareaStyle}
            placeholder="Optional details…"
          />
        </div>

        {/* Deadline toggle */}
        <div style={checkboxRowStyle}>
          <input
            type="checkbox"
            id="has-deadline"
            checked={hasDeadline}
            onChange={(e) => { setHasDeadline(e.target.checked); }}
            style={{ width: "18px", height: "18px", accentColor: YELLOW_DARK }}
          />
          <label htmlFor="has-deadline" style={{ fontSize: "15px", cursor: "pointer" }}>
            Set deadline
          </label>
        </div>

        {/* Deadline date + time inputs */}
        {hasDeadline && (
          <>
            <div>
              <label style={labelStyle} htmlFor="deadline-date-input">
                Date *
              </label>
              <input
                id="deadline-date-input"
                data-testid="deadline-date-input"
                type="date"
                value={date}
                onChange={(e) => { setDate(e.target.value); }}
                style={inputStyle(errors.deadline && date === "")}
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="deadline-time-input">
                Time *
              </label>
              <input
                id="deadline-time-input"
                data-testid="deadline-time-input"
                type="time"
                value={time}
                onChange={(e) => { setTime(e.target.value); }}
                style={inputStyle(errors.deadline && time === "")}
              />
              {errors.deadline && (
                <span style={errorStyle}>
                  Please set both date and time for the deadline.
                </span>
              )}
            </div>
          </>
        )}

        {/* Buttons */}
        <div style={buttonRowStyle}>
          <button
            data-testid="save-button"
            style={saveButtonStyle}
            onClick={() => { void handleSave(); }}
          >
            Save
          </button>
          <button
            data-testid="cancel-button"
            style={cancelButtonStyle}
            onClick={handleCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
