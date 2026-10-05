/**
 * ExportImportService tests — TDD (written before the implementation).
 *
 * §12.5 required tests:
 *  1. Import legacy-maui-export.sample.json → correct fields, ids reset, reversed.
 *  2. Round-trip: export → import → deep-equal (except id/order, compare parsed values).
 *  3. Tolerant keys: camelCase and PascalCase both import to identical todos.
 *  4. Date parsing: ISO with/without fractional seconds and null all survive.
 *  5. Invalid JSON / non-array → returns null, no throw.
 *  6. Unicode round-trip (Hungarian accents + chars System.Text.Json escapes as \uXXXX).
 *  7. (it.skip) Real 46-todo user export — enable when the user supplies the real file.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { createTodo } from "../../src/models/Todo.js";
import {
  exportToJson,
  importFromJson,
} from "../../src/services/ExportImportService.js";

// ---------------------------------------------------------------------------
// Helper: load the fixture JSON from disk as raw string
// ---------------------------------------------------------------------------
const fixtureDir = path.resolve(__dirname, "../fixtures");
const legacyFixturePath = path.join(fixtureDir, "legacy-maui-export.sample.json");

// ---------------------------------------------------------------------------
// §12.5 Test 1 — Import legacy fixture: correct fields, ids reset, reversed
// ---------------------------------------------------------------------------
describe("importFromJson — legacy PascalCase fixture", () => {
  it("returns 3 todos with correct field values", () => {
    const json = fs.readFileSync(legacyFixturePath, "utf-8");
    const result = importFromJson(json);

    expect(result).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const todos = result!;
    expect(todos).toHaveLength(3);
  });

  it("resets all ids to 0 and orders to 0", () => {
    const json = fs.readFileSync(legacyFixturePath, "utf-8");
    const todos = importFromJson(json)!;

    for (const t of todos) {
      expect(t.id).toBe(0);
      expect(t.order).toBe(0);
    }
  });

  it("reverses the array relative to the file (Finish report / Call dentist / Buy groceries)", () => {
    const json = fs.readFileSync(legacyFixturePath, "utf-8");
    const todos = importFromJson(json)!;

    // File order: Buy groceries [0], Call dentist [1], Finish report [2]
    // After reverse: Finish report [0], Call dentist [1], Buy groceries [2]
    expect(todos[0]!.title).toBe("Finish report");
    expect(todos[1]!.title).toBe("Call dentist");
    expect(todos[2]!.title).toBe("Buy groceries");
  });

  it("maps title, description, deadline, isCompleted, completedAt correctly", () => {
    const json = fs.readFileSync(legacyFixturePath, "utf-8");
    const todos = importFromJson(json)!;

    // After reversal: [0]=Finish report, [1]=Call dentist, [2]=Buy groceries
    const finishReport = todos[0]!;
    expect(finishReport.title).toBe("Finish report");
    expect(finishReport.description).toBe("Q1 summary for the team");
    expect(finishReport.deadline).toBe("2026-03-05T17:00:00");
    expect(finishReport.isCompleted).toBe(false);
    expect(finishReport.completedAt).toBeNull();

    const callDentist = todos[1]!;
    expect(callDentist.title).toBe("Call dentist");
    expect(callDentist.description).toBeNull();
    expect(callDentist.deadline).toBeNull();
    expect(callDentist.isCompleted).toBe(true);
    expect(callDentist.completedAt).toBe("2026-02-19T08:30:00");

    const buyGroceries = todos[2]!;
    expect(buyGroceries.title).toBe("Buy groceries");
    expect(buyGroceries.description).toBe("Milk, eggs, bread");
    expect(buyGroceries.deadline).toBe("2026-02-28T14:30:00");
    expect(buyGroceries.isCompleted).toBe(false);
    expect(buyGroceries.completedAt).toBeNull();
  });

  it("preserves createdAt from the fixture (does not override with 'now')", () => {
    const json = fs.readFileSync(legacyFixturePath, "utf-8");
    const todos = importFromJson(json)!;

    // After reversal: [0]=Finish report, [1]=Call dentist, [2]=Buy groceries
    expect(todos[2]!.createdAt).toBe("2026-02-20T09:15:42.1234567");
    expect(todos[1]!.createdAt).toBe("2026-02-18T11:00:00");
    expect(todos[0]!.createdAt).toBe("2026-02-15T16:45:10");
  });
});

// ---------------------------------------------------------------------------
// §12.5 Test 2 — Round-trip: export → import → deep-equal (parsed values)
// Note: id and order are RESET by import; compare all other fields.
//       Import REVERSES the array, so compare against reversed input.
// ---------------------------------------------------------------------------
describe("exportToJson / importFromJson round-trip", () => {
  it("round-trips a todo array (all fields except id and order equal after import+reversal)", () => {
    const now = "2026-01-15T10:00:00.000Z";
    const todos = [
      createTodo({ title: "Alpha", description: "desc a", createdAt: now }),
      createTodo({ title: "Beta", description: null, isCompleted: true, completedAt: now, createdAt: now }),
      createTodo({ title: "Gamma", deadline: "2026-06-01T00:00:00", createdAt: now }),
    ];

    const json = exportToJson(todos);
    const imported = importFromJson(json)!;

    expect(imported).not.toBeNull();
    expect(imported).toHaveLength(3);

    // Import reverses: original [Alpha, Beta, Gamma] → imported [Gamma, Beta, Alpha]
    const reversed = [...todos].reverse();
    for (let i = 0; i < reversed.length; i++) {
      const orig = reversed[i]!;
      const imp = imported[i]!;
      expect(imp.title).toBe(orig.title);
      expect(imp.description).toBe(orig.description);
      expect(imp.deadline).toBe(orig.deadline);
      expect(imp.isCompleted).toBe(orig.isCompleted);
      expect(imp.createdAt).toBe(orig.createdAt);
      expect(imp.completedAt).toBe(orig.completedAt);
      // id and order are reset:
      expect(imp.id).toBe(0);
      expect(imp.order).toBe(0);
    }
  });

  it("emits camelCase keys in the exported JSON string", () => {
    const todo = createTodo({ title: "Test" });
    const json = exportToJson([todo]);
    // Must have camelCase keys
    expect(json).toContain('"title"');
    expect(json).toContain('"isCompleted"');
    expect(json).toContain('"createdAt"');
    // Must NOT have PascalCase keys
    expect(json).not.toContain('"Title"');
    expect(json).not.toContain('"IsCompleted"');
    expect(json).not.toContain('"CreatedAt"');
  });

  it("uses 2-space indentation (matching MAUI WriteIndented)", () => {
    const todo = createTodo({ title: "Indent test" });
    const json = exportToJson([todo]);
    // JSON.stringify(arr, null, 2): array items indented 2 spaces ({),
    // object properties indented 4 spaces. Both verify 2-space-per-level indent.
    expect(json).toMatch(/\n {2}\{/);   // array element open-brace at 2 spaces
    expect(json).toMatch(/\n {4}"/);    // object properties at 4 spaces
  });
});

// ---------------------------------------------------------------------------
// §12.5 Test 3 — Tolerant keys: camelCase and PascalCase both yield identical todos
// ---------------------------------------------------------------------------
describe("importFromJson — tolerant key handling", () => {
  const camelJson = JSON.stringify([
    {
      id: 42,
      title: "camel title",
      description: "camel desc",
      deadline: "2026-05-01T12:00:00",
      isCompleted: false,
      order: 7,
      createdAt: "2026-01-01T00:00:00",
      completedAt: null,
    },
  ]);

  const pascalJson = JSON.stringify([
    {
      Id: 42,
      Title: "camel title",
      Description: "camel desc",
      Deadline: "2026-05-01T12:00:00",
      IsCompleted: false,
      Order: 7,
      CreatedAt: "2026-01-01T00:00:00",
      CompletedAt: null,
    },
  ]);

  it("camelCase and PascalCase imports produce identical todos", () => {
    const fromCamel = importFromJson(camelJson)!;
    const fromPascal = importFromJson(pascalJson)!;

    expect(fromCamel).not.toBeNull();
    expect(fromPascal).not.toBeNull();
    expect(fromCamel).toHaveLength(1);
    expect(fromPascal).toHaveLength(1);

    const camelTodo = fromCamel[0]!;
    const pascalTodo = fromPascal[0]!;

    // All fields (id and order both reset to 0, so they match too)
    expect(camelTodo.title).toBe(pascalTodo.title);
    expect(camelTodo.description).toBe(pascalTodo.description);
    expect(camelTodo.deadline).toBe(pascalTodo.deadline);
    expect(camelTodo.isCompleted).toBe(pascalTodo.isCompleted);
    expect(camelTodo.createdAt).toBe(pascalTodo.createdAt);
    expect(camelTodo.completedAt).toBe(pascalTodo.completedAt);
    expect(camelTodo.id).toBe(0);
    expect(camelTodo.order).toBe(0);
    expect(pascalTodo.id).toBe(0);
    expect(pascalTodo.order).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §12.5 Test 4 — Date parsing: ISO with/without fractional seconds, null
// ---------------------------------------------------------------------------
describe("importFromJson — date parsing", () => {
  it("preserves ISO strings with various fractional second precision without corruption", () => {
    const json = JSON.stringify([
      {
        Id: 1,
        Title: "date test 1",
        Description: null,
        Deadline: "2026-02-20T09:15:42.1234567",
        IsCompleted: false,
        Order: 0,
        CreatedAt: "2026-02-20T09:15:42.062671",
        CompletedAt: null,
      },
      {
        Id: 2,
        Title: "date test 2",
        Description: null,
        Deadline: "2026-02-28T14:30:00",
        IsCompleted: false,
        Order: 1,
        CreatedAt: "2026-02-18T11:00:00",
        CompletedAt: null,
      },
      {
        Id: 3,
        Title: "date test 3 null deadline",
        Description: null,
        Deadline: null,
        IsCompleted: false,
        Order: 2,
        CreatedAt: "2026-01-01T00:00:00",
        CompletedAt: null,
      },
    ]);

    const result = importFromJson(json);
    expect(result).not.toBeNull();
    const todos = result!;
    // Reversed: [2]=date test 3, [1]=date test 2, [0]=date test 1
    const t1 = todos[2]!; // originally first, now last
    const t2 = todos[1]!;
    const t3 = todos[0]!;

    expect(t1.deadline).toBe("2026-02-20T09:15:42.1234567");
    expect(t1.createdAt).toBe("2026-02-20T09:15:42.062671");
    expect(t2.deadline).toBe("2026-02-28T14:30:00");
    expect(t3.deadline).toBeNull();
  });

  it("preserves midnight T00:00:00 deadline form (used by widget)", () => {
    const json = JSON.stringify([
      {
        Id: 1,
        Title: "midnight",
        Description: null,
        Deadline: "2026-03-15T00:00:00",
        IsCompleted: false,
        Order: 0,
        CreatedAt: "2026-01-01T00:00:00",
        CompletedAt: null,
      },
    ]);
    const result = importFromJson(json)!;
    expect(result[0]!.deadline).toBe("2026-03-15T00:00:00");
  });
});

// ---------------------------------------------------------------------------
// §12.5 Test 5 — Invalid JSON / non-array → returns null, no throw
// ---------------------------------------------------------------------------
describe("importFromJson — error handling", () => {
  it("returns null for malformed JSON", () => {
    expect(importFromJson("{not json")).toBeNull();
  });

  it("returns null for valid JSON that is not an array (object)", () => {
    expect(importFromJson("{}")).toBeNull();
  });

  it("returns null for valid JSON that is not an array (string)", () => {
    expect(importFromJson('"just a string"')).toBeNull();
  });

  it("returns null for valid JSON that is not an array (number)", () => {
    expect(importFromJson("42")).toBeNull();
  });

  it("returns null for null literal", () => {
    expect(importFromJson("null")).toBeNull();
  });

  it("does not throw on invalid JSON", () => {
    expect(() => importFromJson("{not json")).not.toThrow();
  });

  it("returns empty array for an empty array input (not null)", () => {
    expect(importFromJson("[]")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §12.5 Test 6 — Unicode round-trip: Hungarian accents + chars .NET escapes
// (These arrive as raw UTF-8 chars in the JS string; JSON.parse normalises \uXXXX from MAUI)
// ---------------------------------------------------------------------------
describe("exportToJson / importFromJson — Unicode round-trip", () => {
  it("round-trips Hungarian accents (á ő ü ö í) as parsed values", () => {
    const title = "Teendő: Főzés á tűzhelyen ö ü í";
    const desc = "Leírás: > < ' & + különleges karakterek";
    const todo = createTodo({ title, description: desc, createdAt: "2026-01-01T00:00:00" });

    const json = exportToJson([todo]);
    const imported = importFromJson(json)!;

    expect(imported).toHaveLength(1);
    // Import reverses single-element array — still 1 item at [0]
    expect(imported[0]!.title).toBe(title);
    expect(imported[0]!.description).toBe(desc);
  });

  it("round-trips chars that System.Text.Json escapes (+ > < ' &) from MAUI import", () => {
    // Simulate what JSON.parse produces when reading a MAUI export with \uXXXX escapes:
    // JSON.parse('\u002B \u003E \u003C \u0027 \u0026') === '+ > < \' &'
    const fromMaui = JSON.stringify([
      {
        Id: 1,
        Title: "\u002B \u003E \u003C \u0027 \u0026",
        Description: "á \u00E1 ő \u0151 ü \u00FC",
        Deadline: null,
        IsCompleted: false,
        Order: 0,
        CreatedAt: "2026-01-01T00:00:00",
        CompletedAt: null,
      },
    ]);

    const imported = importFromJson(fromMaui)!;
    expect(imported[0]!.title).toBe("+ > < ' &");
    expect(imported[0]!.description).toBe("á á ő ő ü ü");
  });

  it("round-trips embedded newlines in descriptions", () => {
    const desc = "Line one\nLine two\nLine three";
    const todo = createTodo({ title: "multiline", description: desc, createdAt: "2026-01-01T00:00:00" });
    const json = exportToJson([todo]);
    const imported = importFromJson(json)!;
    expect(imported[0]!.description).toBe(desc);
  });
});

// ---------------------------------------------------------------------------
// §12.5 Test 7 (it.skip) — Real 46-todo user export file (not yet on disk)
// ---------------------------------------------------------------------------
describe("importFromJson — real user export (46 todos)", () => {
  it.skip(
    "imports all 46 todos from docs/todos_export_20261005_130422.json with no data loss" +
      " — enable when the user supplies the real export file",
    () => {
      // NOTE: The real file docs/todos_export_20261005_130422.json is NOT present on disk
      // (gitignored + not supplied). Enable this test by placing the file at that path.
      // DO NOT print or log the file contents (it contains personal data).
      const realFilePath = path.resolve(__dirname, "../../docs/todos_export_20261005_130422.json");
      const json = fs.readFileSync(realFilePath, "utf-8");
      const todos = importFromJson(json);
      expect(todos).not.toBeNull();
      expect(todos!).toHaveLength(46);
      // Spot-check: all ids reset, all orders reset
      for (const t of todos!) {
        expect(t.id).toBe(0);
        expect(t.order).toBe(0);
      }
      // Spot-check reversal: first todo in the array should match the LAST in the file
      // (reverse-insert logic: caller re-inserts each at top to reproduce file order)
    }
  );
});
