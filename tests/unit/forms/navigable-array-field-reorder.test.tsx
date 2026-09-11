import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NavigableArrayField } from "@/components/forms/navigable-array-field";

/**
 * Phase 2 of the planning-workspace-v2 refactor (2026-08-30):
 * Carousel/Reel slides and scenes need first-class
 * add/duplicate/delete/reorder with both mouse drag and
 * keyboard. These tests pin the contract for the new
 * `moveTo` / `duplicateAt` / drag-drop / Alt+Arrow / Mod+D
 * behaviour.
 */

const COLUMNS = [
  { key: "position", label: "#", kind: "number" as const },
  { key: "summary", label: "Summary", kind: "text" as const },
];

function makeRow(position: number, summary: string) {
  return { position, summary };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NavigableArrayField — reorder & duplicate", () => {
  it("localizes empty, add, counter, and row action copy", () => {
    const onField = vi.fn();
    const t = (key: string, params?: Record<string, string | number>) => {
      const values: Record<string, string> = {
        "formatEditor.editor.structuredArrayEmpty": "لا توجد {label} بعد.",
        "formatEditor.editor.structuredArrayAddFirst": "إضافة أول {entity}",
        "formatEditor.editor.structuredArrayCounter": "{entity} {index} من {count}",
        "formatEditor.editor.structuredArrayItemOf": "من {count}",
        "formatEditor.editor.structuredArrayAdd": "إضافة {entity}",
        "formatEditor.editor.structuredArrayRemoveAria": "إزالة {entity} {index}",
        "formatEditor.editor.structuredArrayRemove": "إزالة",
      };
      const value = values[key] ?? key;
      return value.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ""));
    };

    const { rerender } = render(
      <NavigableArrayField
        fieldKey="slideOutline"
        label="الشرائح"
        rows={[]}
        columns={COLUMNS}
        locale="ar"
        editable
        layout="slider"
        entity="شريحة"
        t={t}
        onField={onField}
      />,
    );

    expect(screen.getByTestId("slideOutline-empty")).toHaveTextContent("لا توجد الشرائح بعد.");
    expect(screen.getByRole("button", { name: "إضافة أول شريحة" })).toBeInTheDocument();

    rerender(
      <NavigableArrayField
        fieldKey="slideOutline"
        label="الشرائح"
        rows={[makeRow(1, "A")]}
        columns={COLUMNS}
        locale="ar"
        editable
        layout="slider"
        entity="شريحة"
        t={t}
        onField={onField}
      />,
    );

    expect(screen.getByTestId("slideOutline-counter")).toHaveTextContent("شريحة 1 من 1");
    expect(screen.getByRole("button", { name: "إضافة شريحة" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إزالة شريحة 1" })).toBeInTheDocument();
  });

  it("moves a row up with the explicit 'Move up' button", () => {
    const onField = vi.fn();
    const rows = [makeRow(1, "A"), makeRow(2, "B"), makeRow(3, "C")];
    render(
      <NavigableArrayField
        fieldKey="slideOutline"
        label="Slides"
        rows={rows}
        columns={COLUMNS}
        locale="en"
        editable
        layout="slider"
        entity="Slide"
        onField={onField}
      />,
    );
    // Switch to slide 3
    fireEvent.click(screen.getByTestId("slideOutline-tab-2"));
    // Move up
    fireEvent.click(screen.getByTestId("slideOutline-move-up"));
    // Expect new order: A, C, B (slide 3 moved up by 1).
    const lastCall = onField.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe("slideOutline");
    const next = lastCall?.[1] as Array<{ position: number; summary: string }>;
    expect(next.map((r) => r.summary)).toEqual(["A", "C", "B"]);
  });

  it("moves a row down with the explicit 'Move down' button", () => {
    const onField = vi.fn();
    const rows = [makeRow(1, "A"), makeRow(2, "B"), makeRow(3, "C")];
    render(
      <NavigableArrayField
        fieldKey="slideOutline"
        label="Slides"
        rows={rows}
        columns={COLUMNS}
        locale="en"
        editable
        layout="slider"
        entity="Slide"
        onField={onField}
      />,
    );
    // Slide 1 down
    fireEvent.click(screen.getByTestId("slideOutline-move-down"));
    const lastCall = onField.mock.calls.at(-1);
    const next = lastCall?.[1] as Array<{ position: number; summary: string }>;
    expect(next.map((r) => r.summary)).toEqual(["B", "A", "C"]);
  });

  it("duplicates the active row with the explicit 'Duplicate' button", () => {
    const onField = vi.fn();
    const rows = [makeRow(1, "A"), makeRow(2, "B")];
    render(
      <NavigableArrayField
        fieldKey="slideOutline"
        label="Slides"
        rows={rows}
        columns={COLUMNS}
        locale="en"
        editable
        layout="slider"
        entity="Slide"
        onField={onField}
      />,
    );
    // Active is slide 1 by default
    fireEvent.click(screen.getByTestId("slideOutline-duplicate"));
    const lastCall = onField.mock.calls.at(-1);
    const next = lastCall?.[1] as Array<{ position: number; summary: string }>;
    expect(next).toHaveLength(3);
    expect(next[0]?.summary).toBe("A");
    expect(next[1]?.summary).toBe("A");
    expect(next[2]?.summary).toBe("B");
  });

  it("reorders via Alt+ArrowUp / Alt+ArrowDown on a focused chip", () => {
    const onField = vi.fn();
    const rows = [makeRow(1, "A"), makeRow(2, "B"), makeRow(3, "C")];
    render(
      <NavigableArrayField
        fieldKey="slideOutline"
        label="Slides"
        rows={rows}
        columns={COLUMNS}
        locale="en"
        editable
        layout="slider"
        entity="Slide"
        onField={onField}
      />,
    );
    const chip = screen.getByTestId("slideOutline-tab-1") as HTMLButtonElement;
    chip.focus();
    // Alt+ArrowDown on row 2 should move it to position 3
    fireEvent.keyDown(chip, { key: "ArrowDown", altKey: true });
    const lastCall = onField.mock.calls.at(-1);
    const next = lastCall?.[1] as Array<{ position: number; summary: string }>;
    expect(next.map((r) => r.summary)).toEqual(["A", "C", "B"]);
  });

  it("ignores plain ArrowUp without Alt (default focus nav still works)", () => {
    const onField = vi.fn();
    const rows = [makeRow(1, "A"), makeRow(2, "B")];
    render(
      <NavigableArrayField
        fieldKey="slideOutline"
        label="Slides"
        rows={rows}
        columns={COLUMNS}
        locale="en"
        editable
        layout="slider"
        entity="Slide"
        onField={onField}
      />,
    );
    const chip = screen.getByTestId("slideOutline-tab-1") as HTMLButtonElement;
    chip.focus();
    fireEvent.keyDown(chip, { key: "ArrowDown" });
    // onField is NOT called for plain ArrowDown — focus nav only.
    expect(onField).not.toHaveBeenCalled();
  });

  it("duplicates via Ctrl/Cmd+D on a focused chip", () => {
    const onField = vi.fn();
    const rows = [makeRow(1, "A")];
    render(
      <NavigableArrayField
        fieldKey="scenes"
        label="Scenes"
        rows={rows}
        columns={COLUMNS}
        locale="en"
        editable
        layout="slider"
        entity="Scene"
        onField={onField}
      />,
    );
    const chip = screen.getByTestId("scenes-tab-0") as HTMLButtonElement;
    chip.focus();
    fireEvent.keyDown(chip, { key: "d", ctrlKey: true });
    const lastCall = onField.mock.calls.at(-1);
    const next = lastCall?.[1] as Array<{ position: number; summary: string }>;
    expect(next).toHaveLength(2);
    expect(next[0]?.summary).toBe("A");
    expect(next[1]?.summary).toBe("A");
  });

  it("reorders via HTML5 drag-and-drop on chips", () => {
    const onField = vi.fn();
    const rows = [makeRow(1, "A"), makeRow(2, "B"), makeRow(3, "C")];
    render(
      <NavigableArrayField
        fieldKey="slideOutline"
        label="Slides"
        rows={rows}
        columns={COLUMNS}
        locale="en"
        editable
        layout="slider"
        entity="Slide"
        onField={onField}
      />,
    );
    const source = screen.getByTestId("slideOutline-tab-0");
    const target = screen.getByTestId("slideOutline-tab-2");
    fireEvent.dragStart(source);
    fireEvent.dragOver(target);
    fireEvent.drop(target, { dataTransfer: { getData: () => "0" } });
    const lastCall = onField.mock.calls.at(-1);
    const next = lastCall?.[1] as Array<{ position: number; summary: string }>;
    // Source moved from index 0 to index 2 → B, C, A
    expect(next.map((r) => r.summary)).toEqual(["B", "C", "A"]);
  });

  it("removes the active row with the Delete key", () => {
    const onField = vi.fn();
    const rows = [makeRow(1, "A"), makeRow(2, "B")];
    render(
      <NavigableArrayField
        fieldKey="slideOutline"
        label="Slides"
        rows={rows}
        columns={COLUMNS}
        locale="en"
        editable
        layout="slider"
        entity="Slide"
        onField={onField}
      />,
    );
    const chip = screen.getByTestId("slideOutline-tab-1") as HTMLButtonElement;
    chip.focus();
    fireEvent.keyDown(chip, { key: "Delete" });
    const lastCall = onField.mock.calls.at(-1);
    const next = lastCall?.[1] as Array<{ position: number; summary: string }>;
    expect(next.map((r) => r.summary)).toEqual(["A"]);
  });
});
