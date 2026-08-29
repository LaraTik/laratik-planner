"use client";

import * as React from "react";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import type { FieldDef } from "./format-payload-field-set";

/**
 * Two-tier disclosure for the format-payload editor.
 *
 * Renders a "Show advanced (N)" button when collapsed; renders the
 * advanced field renderers inline when expanded. The default state
 * is **collapsed** on the user's first visit. The disclosure
 * auto-expands individual fields that already contain content
 * (e.g. a planner who filled in `voiceOverNotes` last week sees
 * that field the next time they open the editor), and the
 * "Always show" pill makes the expanded state sticky across
 * sessions via `localStorage`.
 *
 * State machine:
 *   - `open=false`, populated fields hidden: default on first visit.
 *   - `open=false`, populated fields visible: auto-expand mode
 *     (the disclosure stays collapsed; the populated fields are
 *     rendered above it so the planner can see their work).
 *   - `open=true`: the disclosure is open; all advanced fields render
 *     inline. The button label changes to "Hide advanced".
 *   - "Always show" is a user-preference toggle in the disclosure
 *     header. It mirrors `localStorage` so a planner who wants
 *     advanced fields visible on every visit doesn't have to
 *     re-open the disclosure every time.
 *
 * Persistence key: `laratik.format.alwaysShowAdvanced` (a
 * `{ [format]: boolean }` map). The format is keyed so a static
 * post planner can have advanced collapsed while a short-form video
 * planner can have it expanded.
 */

export interface AdvancedDisclosureProps {
  /** All advanced fields for the active format. */
  fields: ReadonlyArray<FieldDef>;
  /** Active format — used as the localStorage key. */
  format: string;
  /**
   * The current payload, used to determine which advanced fields
   * already contain content (and therefore auto-expand).
   */
  payload: Record<string, unknown>;
  /** Render each advanced field. */
  renderField: (field: FieldDef) => React.ReactNode;
  /**
   * Optional override for the disclosure header label. Default
   * "Advanced details".
   */
  label?: string;
}

function readPreference(format: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem("laratik.format.alwaysShowAdvanced");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return Boolean(parsed[format]);
  } catch {
    return false;
  }
}

function writePreference(format: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem("laratik.format.alwaysShowAdvanced");
    const map: Record<string, boolean> = raw ? JSON.parse(raw) : {};
    map[format] = value;
    window.localStorage.setItem("laratik.format.alwaysShowAdvanced", JSON.stringify(map));
  } catch {
    // localStorage is unavailable (private mode, quota, etc.) —
    // the feature degrades gracefully (the preference is not
    // remembered, the disclosure stays in its default state).
  }
}

/** True if the value is non-empty (string / array / object). */
function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

export function AdvancedDisclosure({
  fields,
  format,
  payload,
  renderField,
  label = "Advanced details",
}: AdvancedDisclosureProps) {
  // The disclosure is collapsed by default; the always-show
  // preference overrides that. We read the preference on mount
  // (client-only); SSR rendering shows the collapsed state.
  const [open, setOpen] = React.useState(false);
  const [alwaysShow, setAlwaysShow] = React.useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAlwaysShow(readPreference(format));
  }, [format]);

  // When the user clicks "Always show", persist the preference and
  // open the disclosure. When they click "Hide", clear the
  // preference and collapse.
  const toggleAlwaysShow = () => {
    const next = !alwaysShow;
    setAlwaysShow(next);
    writePreference(format, next);
    if (next) setOpen(true);
  };

  // Advanced fields that already contain content. These are
  // always rendered (above the disclosure) so the planner doesn't
  // lose visibility of their work. The `keepOpenWhenFilled: false`
  // override on a field suppresses this behaviour.
  const populated = fields.filter(
    (f) => isFilled(payload[f.key]) && f.keepOpenWhenFilled !== false,
  );
  const empty = fields.filter((f) => !isFilled(payload[f.key]));

  // The disclosure's collapsed state is the *negative* of `open` —
  // collapsed by default, expanded when the user clicks the button
  // or when always-show is on.
  const showDisclosure = open || alwaysShow;

  if (fields.length === 0) return null;

  return (
    <div
      className="border-border bg-canvas space-y-4 rounded-[var(--radius-control)] border p-3"
      data-testid="advanced-disclosure"
      data-format={format}
      data-open={showDisclosure ? "true" : "false"}
    >
      {/* Populated advanced fields are always visible — they
          represent existing creative work the planner shouldn't
          lose. Render them above the disclosure so the user sees
          them regardless of the disclosure state. */}
      {populated.length > 0 ? (
        <div className="space-y-4" data-testid="advanced-disclosure-populated">
          {populated.map((f) => (
            <div key={f.key} data-testid={`advanced-field-${f.key}`}>
              {renderField(f)}
            </div>
          ))}
        </div>
      ) : null}

      {showDisclosure ? (
        <div className="space-y-4" data-testid="advanced-disclosure-empty-fields">
          {empty.length > 0
            ? empty.map((f) => (
                <div key={f.key} data-testid={`advanced-field-${f.key}`}>
                  {renderField(f)}
                </div>
              ))
            : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-label text-primary focus-visible:ring-focus-ring inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
              data-testid="advanced-disclosure-collapse"
            >
              <ChevronDown className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
              Hide advanced
            </button>
            <button
              type="button"
              onClick={toggleAlwaysShow}
              className="text-label text-fg-secondary focus-visible:ring-focus-ring inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
              data-testid="advanced-disclosure-always-show"
              aria-pressed={alwaysShow}
            >
              {alwaysShow ? (
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {alwaysShow ? "Hide always" : "Always show"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-label text-primary focus-visible:ring-focus-ring inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
            data-testid="advanced-disclosure-show"
            aria-expanded={false}
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            {`${label} (${fields.length})`}
          </button>
          {empty.length > 0 ? (
            <span className="text-label text-fg-muted">{empty.length} empty</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
