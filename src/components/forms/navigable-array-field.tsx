"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { DirAwareChevronLeft, DirAwareChevronRight } from "@/components/ui/dir-aware-icon";

import { Button } from "@/components/ui/button";
import { DirAwareInput } from "@/components/forms/dir-aware-textarea";
import { cn } from "@/lib/utils";

/**
 * `NavigableArrayField` — a structured list editor with two
 * layouts:
 *
 * - `"slider"` — a horizontal chip strip (slide 1, slide 2,
 *   …) where the active chip drives a content pane below.
 *   Designed for `slideOutline` (carousel), `visualSlides`
 *   (static post per-slide visual direction), `scenes`
 *   (short-form video), and `chapters` (long-form video).
 *   A 10-slide carousel is a long page if every slide is
 *   expanded; the slider UX collapses to one slide at a
 *   time and keeps the rest of the form scannable.
 *
 * - `"list"` — the original vertical row stack. Kept for
 *   the lists where ordering is shallow and the user
 *   benefits from seeing everything at once
 *   (`outline` headings, `guests`, `runOfShow`).
 *
 * UX details shared by both layouts:
 *
 * - Every input is `DirAwareInput` so the first non-
 *   whitespace char drives the `dir` (English LTR, Arabic
 *   RTL). A planner can type an English caption inside an
 *   otherwise Arabic form and the field still flows LTR.
 * - The add button is at the end of the chip strip
 *   (slider) or below the last row (list). Add always
 *   appends — reordering is a future enhancement; v1
 *   matches the slide numbering the planner writes
 *   manually.
 * - Remove is per-row (trash icon on the row) and is
 *   only shown in editable mode. The list is renumbered
 *   on every render so the `position` field is the
 *   current display order, not the original index.
 * - Read-only mode hides the + / trash controls but
 *   still renders the chip strip / row stack so the
 *   editor stays useful as a reference for creative
 *   handoff.
 * - Reorder: `Alt+ArrowUp` / `Alt+ArrowDown` on a focused
 *   chip moves that row up/down by one. There are also
 *   explicit "Move up" / "Move down" / "Duplicate" buttons
 *   in the active panel header. Mouse users can drag
 *   chips to reorder — the strip is HTML5 draggable with
 *   visible drop indicators.
 *
 * Keyboard nav: when a chip has focus, Left/Right arrows
 * move the active index, Home/End jump to the first/last
 * chip, Delete removes the active chip (editable mode
 * only). The chip strip is a `role="tablist"` with
 * `aria-selected` on the active chip; the content pane
 * is `role="tabpanel"` linked by `aria-controls`.
 */

export interface NavigableArrayColumn {
  key: string;
  label: string;
  kind: "text" | "number";
  optional?: boolean;
  /**
   * When `true`, this column's value is used as the
   * chip's preview text (truncated). Defaults to the
   * first non-position column.
   */
  preview?: boolean;
}

export interface NavigableArrayFieldProps {
  fieldKey: string;
  label: string;
  hint?: string | undefined;
  rows: unknown[];
  columns: ReadonlyArray<NavigableArrayColumn>;
  locale: string;
  editable: boolean;
  layout: "slider" | "list";
  /**
   * Singular label for the "Add" button. The chip-strip
   * counter says "Slide 1 of 5" / "Scene 3 of 8" / "Chapter
   * 1 of 4" — `entity` is the noun. Default: "Entry".
   */
  entity?: string | undefined;
  onField: (key: string, value: unknown) => void;
}

export function NavigableArrayField({
  fieldKey,
  label,
  hint,
  rows,
  columns,
  locale,
  editable,
  layout,
  entity,
  onField,
}: NavigableArrayFieldProps) {
  const [activeIndex, setActiveIndex] = React.useState(0);

  // Clamp the active index when the row count changes
  // (e.g. the user removed the active row, or initial
  // load has fewer rows than the last saved value). The
  // setState is "reset derived state from props" — the
  // active index is derived from the row count, not
  // independently maintained. React's
  // `set-state-in-effect` lint warns here, but the
  // alternative (clamping in render with `Math.min`)
  // would change the active index without notifying the
  // keyboard handler, leaving the user focused on a chip
  // that's no longer active.
  React.useEffect(() => {
    if (activeIndex >= rows.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveIndex(Math.max(0, rows.length - 1));
    }
  }, [rows.length, activeIndex]);

  function update(next: unknown[]) {
    onField(fieldKey, next.length > 0 ? next : undefined);
  }

  function append() {
    const nextRow: Record<string, unknown> = {};
    for (const c of columns) {
      if (c.kind === "number" && c.key === "position") {
        nextRow[c.key] = rows.length + 1;
      }
    }
    const next = [...rows, nextRow];
    update(next);
    setActiveIndex(next.length - 1);
  }

  /**
   * Move the row at `from` to the slot currently held by
   * `to`. We re-insert (instead of swapping) so the user
   * can drag a chip from the middle to the end without
   * the intermediate slide flipping twice. Positions are
   * renumbered on the next render so `position` always
   * reflects the current display order.
   */
  function moveTo(from: number, to: number) {
    if (from === to) return;
    if (from < 0 || from >= rows.length) return;
    if (to < 0 || to >= rows.length) return;
    const next = rows.slice();
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    update(next);
    setActiveIndex(to);
  }

  /** Duplicate the row at `idx` and insert the copy
   *  immediately after it. Useful for carousel slides
   *  where the planner wants a copy with a tweak. */
  function duplicateAt(idx: number) {
    if (idx < 0 || idx >= rows.length) return;
    const source = rows[idx];
    if (!source || typeof source !== "object" || Array.isArray(source)) return;
    const copy: Record<string, unknown> = { ...(source as Record<string, unknown>) };
    const next = [...rows];
    next.splice(idx + 1, 0, copy);
    update(next);
    setActiveIndex(idx + 1);
  }

  // Local drag state. We track the row currently being
  // dragged and the row the user is hovering over, so
  // the drop indicator appears on the target chip.
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dropTarget, setDropTarget] = React.useState<number | null>(null);

  function removeAt(idx: number) {
    const next = rows.filter((_, i) => i !== idx);
    update(next);
    if (activeIndex >= next.length) {
      setActiveIndex(Math.max(0, next.length - 1));
    }
  }

  function patchRow(idx: number, key: string, value: unknown) {
    const r =
      rows[idx] && typeof rows[idx] === "object" ? (rows[idx] as Record<string, unknown>) : {};
    const nextRow = { ...r };
    if (value === undefined) {
      delete nextRow[key];
    } else {
      nextRow[key] = value;
    }
    const nextRows = rows.slice();
    nextRows[idx] = nextRow;
    update(nextRows);
  }

  // The preview column drives the chip text. Default to
  // the first non-position text column.
  const previewColumn =
    columns.find((c) => c.preview) ??
    columns.find((c) => c.kind === "text" && c.key !== "position" && c.key !== "name") ??
    columns.find((c) => c.kind === "text") ??
    columns[0];

  const noun = entity ?? "Entry";

  if (layout === "slider") {
    return (
      <div className="space-y-1.5" data-testid={`navigable-array-slider-${fieldKey}`}>
        <div className="flex items-baseline justify-between gap-2">
          <label
            htmlFor={`${fieldKey}-active`}
            className="text-body text-fg-primary block font-semibold"
          >
            {label}
          </label>
          {rows.length > 0 ? (
            <p className="text-label text-fg-muted" data-testid={`${fieldKey}-counter`}>
              {noun} {activeIndex + 1} of {rows.length}
            </p>
          ) : null}
        </div>
        {hint ? <p className="text-label text-fg-muted">{hint}</p> : null}

        {/* Chip strip */}
        <div
          className="border-border bg-surface rounded-[var(--radius-control)] border p-2"
          role="tablist"
          aria-label={label}
        >
          {rows.length === 0 ? (
            <p
              className="text-label text-fg-muted px-2 py-3 text-center"
              data-testid={`${fieldKey}-empty`}
            >
              No {noun.toLowerCase()}s yet.
            </p>
          ) : (
            <ol className="flex scrollbar-thin items-center gap-1.5 overflow-x-auto pb-1">
              {rows.map((row, idx) => {
                const r =
                  row && typeof row === "object" && !Array.isArray(row)
                    ? (row as Record<string, unknown>)
                    : {};
                const previewVal =
                  previewColumn && typeof r[previewColumn.key] === "string"
                    ? (r[previewColumn.key] as string).trim()
                    : "";
                const isActive = idx === activeIndex;
                const isDropTarget =
                  editable && dropTarget === idx && dragIndex !== null && dragIndex !== idx;
                return (
                  <li key={idx} className="shrink-0">
                    <button
                      type="button"
                      role="tab"
                      id={`${fieldKey}-tab-${idx}`}
                      aria-selected={isActive}
                      aria-controls={`${fieldKey}-panel`}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => setActiveIndex(idx)}
                      onKeyDown={(e) =>
                        handleChipKey(
                          e,
                          idx,
                          rows.length,
                          setActiveIndex,
                          editable,
                          moveTo,
                          removeAt,
                          duplicateAt,
                        )
                      }
                      data-testid={`${fieldKey}-tab-${idx}`}
                      draggable={editable}
                      onDragStart={(e) => {
                        if (!editable) return;
                        setDragIndex(idx);
                        // dataTransfer is required for
                        // Firefox to consider the element
                        // draggable; the actual payload is
                        // kept in React state.
                        try {
                          e.dataTransfer.setData("text/plain", String(idx));
                          e.dataTransfer.effectAllowed = "move";
                        } catch {
                          // Some test environments throw on
                          // dataTransfer access — ignore.
                        }
                      }}
                      onDragOver={(e) => {
                        if (!editable) return;
                        e.preventDefault();
                        try {
                          e.dataTransfer.dropEffect = "move";
                        } catch {
                          // ignore
                        }
                        if (dropTarget !== idx) setDropTarget(idx);
                      }}
                      onDragLeave={() => {
                        if (dropTarget === idx) setDropTarget(null);
                      }}
                      onDrop={(e) => {
                        if (!editable) return;
                        e.preventDefault();
                        const from = dragIndex;
                        if (from !== null) moveTo(from, idx);
                        setDragIndex(null);
                        setDropTarget(null);
                      }}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setDropTarget(null);
                      }}
                      aria-grabbed={dragIndex === idx || undefined}
                      className={cn(
                        "border-border bg-surface text-fg-primary text-label flex max-w-[10rem] items-center gap-2 rounded-full border px-3 py-1.5 text-start transition-colors",
                        "hover:bg-surface-subtle focus-visible:ring-focus-ring focus-visible:ring-2 focus-visible:outline-none",
                        isActive
                          ? "border-primary bg-primary-subtle text-primary font-semibold"
                          : "",
                        isDropTarget ? "ring-2 ring-[color:var(--primary)] ring-offset-1" : "",
                        dragIndex === idx ? "opacity-60" : "",
                      )}
                    >
                      <span
                        className={cn(
                          "text-label inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-semibold",
                          isActive
                            ? "bg-primary text-white"
                            : "bg-surface-subtle text-fg-secondary",
                        )}
                      >
                        {idx + 1}
                      </span>
                      <span className="truncate">
                        {previewVal || <span className="text-fg-muted italic">Untitled</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
              {editable ? (
                <li className="shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={append}
                    aria-label={`Add ${noun.toLowerCase()}`}
                    data-testid={`${fieldKey}-add`}
                    className="rounded-full"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add {noun.toLowerCase()}
                  </Button>
                </li>
              ) : null}
            </ol>
          )}

          {editable && rows.length === 0 ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={append}
                data-testid={`${fieldKey}-add-empty`}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add first {noun.toLowerCase()}
              </Button>
            </div>
          ) : null}
        </div>

        {/* Active content pane */}
        {rows.length > 0 ? (
          <div
            id={`${fieldKey}-panel`}
            role="tabpanel"
            aria-labelledby={`${fieldKey}-tab-${activeIndex}`}
            className="border-border bg-surface rounded-[var(--radius-control)] border p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-label text-fg-secondary font-semibold">
                {noun} {activeIndex + 1}
                <span
                  className="text-fg-muted ms-1 font-normal"
                  data-testid={`${fieldKey}-active-counter`}
                >
                  of {rows.length}
                </span>
              </p>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}
                  disabled={activeIndex === 0}
                  aria-label="Previous"
                >
                  <DirAwareChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setActiveIndex(Math.min(rows.length - 1, activeIndex + 1))}
                  disabled={activeIndex >= rows.length - 1}
                  aria-label="Next"
                >
                  <DirAwareChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                {editable ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => moveTo(activeIndex, activeIndex - 1)}
                      disabled={activeIndex === 0}
                      aria-label={`Move ${noun.toLowerCase()} ${activeIndex + 1} up`}
                      data-testid={`${fieldKey}-move-up`}
                      title="Move up (Alt+ArrowUp)"
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => moveTo(activeIndex, activeIndex + 1)}
                      disabled={activeIndex >= rows.length - 1}
                      aria-label={`Move ${noun.toLowerCase()} ${activeIndex + 1} down`}
                      data-testid={`${fieldKey}-move-down`}
                      title="Move down (Alt+ArrowDown)"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => duplicateAt(activeIndex)}
                      aria-label={`Duplicate ${noun.toLowerCase()} ${activeIndex + 1}`}
                      data-testid={`${fieldKey}-duplicate`}
                      title="Duplicate (Ctrl/Cmd+D)"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeAt(activeIndex)}
                      aria-label={`Remove ${noun.toLowerCase()} ${activeIndex + 1}`}
                      data-testid={`${fieldKey}-remove`}
                      className="text-fg-muted hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            <div
              className={cn(
                "grid gap-2",
                columns.length === 3 ? "grid-cols-1 md:grid-cols-12" : "grid-cols-1",
              )}
            >
              {columns.map((c) => {
                const cellId = `${fieldKey}-active-${c.key}`;
                const r =
                  rows[activeIndex] &&
                  typeof rows[activeIndex] === "object" &&
                  !Array.isArray(rows[activeIndex])
                    ? (rows[activeIndex] as Record<string, unknown>)
                    : {};
                const cellVal = r[c.key];
                return (
                  <div
                    key={c.key}
                    className={cn(
                      c.kind === "number" && c.key === "position"
                        ? "md:col-span-2"
                        : c.kind === "text"
                          ? "md:col-span-9"
                          : "md:col-span-3",
                    )}
                  >
                    <label
                      htmlFor={cellId}
                      className="text-label text-fg-muted mb-1 block font-semibold"
                    >
                      {c.label}
                    </label>
                    <DirAwareInput
                      id={cellId}
                      locale={locale}
                      type={c.kind === "number" ? "number" : "text"}
                      value={
                        typeof cellVal === "number" || typeof cellVal === "string"
                          ? String(cellVal)
                          : ""
                      }
                      readOnly={!editable}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (c.kind === "number") {
                          const n = v ? Number(v) : undefined;
                          patchRow(
                            activeIndex,
                            c.key,
                            n === undefined || !Number.isFinite(n) ? undefined : n,
                          );
                          return;
                        }
                        patchRow(activeIndex, c.key, v ? v : undefined);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // list layout (the original vertical stack)
  return (
    <div className="space-y-1.5" data-testid={`navigable-array-list-${fieldKey}`}>
      <label htmlFor={fieldKey} className="text-body text-fg-primary block font-semibold">
        {label}
      </label>
      {hint ? <p className="text-label text-fg-muted">{hint}</p> : null}
      <div className="border-border bg-surface rounded-[var(--radius-control)] border p-2">
        {rows.length === 0 ? <p className="text-label text-fg-muted">No entries yet.</p> : null}
        <ul className="space-y-2">
          {rows.map((row, idx) => {
            const r =
              row && typeof row === "object" && !Array.isArray(row)
                ? (row as Record<string, unknown>)
                : {};
            return (
              <li
                key={idx}
                className="border-border grid grid-cols-12 items-center gap-2 border-b pb-2 last:border-b-0"
              >
                {columns.map((c) => {
                  const cellId = `${fieldKey}-${idx}-${c.key}`;
                  const cellVal = r[c.key];
                  return (
                    <div
                      key={c.key}
                      className={
                        c.kind === "number" && c.key === "position"
                          ? "col-span-2"
                          : c.kind === "text"
                            ? "col-span-9"
                            : "col-span-3"
                      }
                    >
                      <label
                        htmlFor={cellId}
                        className="text-label text-fg-muted block font-semibold"
                      >
                        {c.label}
                      </label>
                      <DirAwareInput
                        id={cellId}
                        locale={locale}
                        type={c.kind === "number" ? "number" : "text"}
                        value={
                          typeof cellVal === "number" || typeof cellVal === "string"
                            ? String(cellVal)
                            : ""
                        }
                        readOnly={!editable}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (c.kind === "number") {
                            const n = v ? Number(v) : undefined;
                            patchRow(
                              idx,
                              c.key,
                              n === undefined || !Number.isFinite(n) ? undefined : n,
                            );
                            return;
                          }
                          patchRow(idx, c.key, v ? v : undefined);
                        }}
                      />
                    </div>
                  );
                })}
                {editable ? (
                  <div className="col-span-1 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeAt(idx)}
                      aria-label={`Remove row ${idx + 1}`}
                      className="text-fg-muted hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                ) : (
                  <div className="col-span-1" />
                )}
              </li>
            );
          })}
        </ul>
        {editable ? (
          <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={append}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add {noun.toLowerCase()}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Keyboard navigation for the chip strip. Arrow keys
 * move the active index; Home / End jump to the ends;
 * Delete removes the active chip in editable mode.
 *
 * The focus moves to the newly-active chip so the
 * keyboard user can keep pressing arrows without
 * re-tabbing.
 */
function handleChipKey(
  e: React.KeyboardEvent<HTMLButtonElement>,
  idx: number,
  total: number,
  setActiveIndex: (n: number) => void,
  editable: boolean,
  moveTo: (from: number, to: number) => void,
  removeAt: (idx: number) => void,
  duplicateAt: (idx: number) => void,
) {
  switch (e.key) {
    case "ArrowLeft":
      e.preventDefault();
      if (idx > 0) {
        setActiveIndex(idx - 1);
        requestAnimationFrame(() => focusChipSibling(e.currentTarget, -1));
      }
      return;
    case "ArrowRight":
      e.preventDefault();
      if (idx < total - 1) {
        setActiveIndex(idx + 1);
        requestAnimationFrame(() => focusChipSibling(e.currentTarget, 1));
      }
      return;
    case "Home":
      e.preventDefault();
      setActiveIndex(0);
      requestAnimationFrame(() => focusChipByIndex(0));
      return;
    case "End":
      e.preventDefault();
      setActiveIndex(total - 1);
      requestAnimationFrame(() => focusChipByIndex(total - 1));
      return;
    // Reorder: Alt+ArrowUp / Alt+ArrowDown swaps the
    // active row with the neighbour above/below. Alt is
    // required so the bare arrow keys keep their default
    // meaning (move focus between chips, no data change).
    case "ArrowUp":
      if (editable && e.altKey) {
        e.preventDefault();
        moveTo(idx, idx - 1);
        requestAnimationFrame(() => focusChipByIndex(Math.max(0, idx - 1)));
      }
      return;
    case "ArrowDown":
      if (editable && e.altKey) {
        e.preventDefault();
        moveTo(idx, idx + 1);
        requestAnimationFrame(() => focusChipByIndex(Math.min(total - 1, idx + 1)));
      }
      return;
    // Delete / Backspace removes the focused chip in
    // editable mode. We do NOT treat these as plain typing
    // because the chip button is a single focusable
    // element — there's no input to receive the keystroke.
    case "Delete":
    case "Backspace":
      if (editable) {
        e.preventDefault();
        removeAt(idx);
      }
      return;
    // Ctrl/Cmd+D duplicates the focused chip.
    case "d":
    case "D":
      if (editable && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        duplicateAt(idx);
        requestAnimationFrame(() => focusChipByIndex(Math.min(total, idx + 1)));
      }
      return;
    default:
      return;
  }
}

function focusChipSibling(current: HTMLButtonElement, direction: -1 | 1) {
  const li = current.parentElement;
  const next = direction === -1 ? li?.previousElementSibling : li?.nextElementSibling;
  const btn = next?.querySelector("button");
  btn?.focus();
}

function focusChipByIndex(idx: number) {
  const btn = document.querySelector<HTMLButtonElement>(`[data-testid$="-tab-${idx}"]`);
  btn?.focus();
}
