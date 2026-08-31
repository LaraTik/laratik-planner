"use client";

/**
 * Client-side wrappers around `InlineEditableField` for the
 * planning detail page.
 *
 * Why this file exists
 * --------------------
 * The planning detail page is a Next.js Server Component
 * (`src/app/(app)/app/w/[slug]/planning/[id]/page.tsx`). It used
 * to instantiate `InlineEditableField` (a `"use client"`
 * component) directly with inline `render` / `renderEditor` /
 * `onSave` arrow functions. Those arrows are not serialisable —
 * Next.js 16 only allows plain values, plain objects, and
 * Server-Action functions to cross the server→client boundary.
 * The runtime error was:
 *
 *   Functions cannot be passed directly to Client Components
 *   unless you explicitly expose it by marking it with "use
 *   server". Or maybe you meant to call this function rather
 *   than return it.
 *   Event handlers cannot be passed to Client Component props.
 *
 * The three usages (Brief / Title / Date) all errored, and the
 * page rendered the parent error boundary ("We hit an error
 * rendering Planning"). The other interactive sections on the
 * page — `workflow-bar`, `delivery-section`, `discussion-section`,
 * `ai-assistance-section`, `reset-idea-section` — are already
 * `"use client"` files. This module follows the same pattern:
 * a thin client-side wrapper per inline field, taking only
 * serialisable props from the server.
 *
 * Contract
 * --------
 *  - `InlineBriefEditor`   — string brief, calls
 *                            `inlineUpdateBriefAction`.
 *  - `InlineTitleEditor`   — string title, calls
 *                            `inlineUpdateTitleAction`.
 *  - `InlineDateEditor`    — ISO string + workspace timezone,
 *                            calls `inlineUpdateDateAction`.
 *
 * The server actions are imported from `@/lib/content/inline-update`
 * which has a module-level `"use server"` directive. Server actions
 * can be called from client components, and Next.js wires the
 * network call automatically. The `onSave` arrow that calls them
 * is built *inside* this client module, so it never crosses a
 * boundary.
 *
 * Regression coverage
 * -------------------
 * `tests/unit/planning/inline-editable-fields.test.tsx` asserts
 * that these three components are exported with `"use client"` so
 * a future refactor that drops the directive (and re-introduces
 * the same bug) fails CI before it ships.
 */
import * as React from "react";
import { InlineEditableField } from "@/components/forms/inline-editable-field";
import {
  inlineUpdateBriefAction,
  inlineUpdateDateAction,
  inlineUpdateTitleAction,
} from "@/lib/content/inline-update";
import { formatDateForInput, parseInputAsLocalDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

/**
 * StudioFlow input chrome — every editable field on the
 * planning detail page uses the same focus ring, border, and
 * padding so the page reads as one surface, not three
 * independent editors.
 *
 *   focus-visible:ring-focus-ring → 2px ring at the focus
 *                                  colour, 1px offset to keep
 *                                  the border crisp.
 *   focus-visible:ring-offset-1   → 1px gap between the input
 *                                  border and the ring; without
 *                                  it the ring looks "muddy"
 *                                  against the 1px border.
 *   focus-visible:outline-none    → drop the browser default
 *                                  outline (we replace it with
 *                                  the ring).
 */
const INPUT_CHROME =
  "border-border bg-surface text-fg-primary text-body w-full rounded-[var(--radius-control)] border px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1";

/**
 * Brief inline editor. View mode shows the brief as pre-wrapped
 * text, or a muted placeholder when empty. Edit mode is a
 * 6-row textarea capped at 2_000 chars (matches
 * `BriefUpdateSchema.brief` in `lib/content/inline-update.ts`),
 * with a live `X / 2 000` character counter that turns warning
 * at 90 % and danger at 100 % so the user has a soft warning
 * before the browser hard-stops them at `maxLength`.
 */
const BRIEF_MAX = 2000;
const BRIEF_WARN = Math.floor(BRIEF_MAX * 0.9); // 1 800
export function InlineBriefEditor({
  workspaceSlug,
  contentItemId,
  value,
}: {
  workspaceSlug: string;
  contentItemId: string;
  value: string;
}) {
  return (
    <InlineEditableField
      testId="inline-edit-brief"
      label="brief"
      value={value}
      render={(v) =>
        v ? (
          <p className="text-body text-fg-primary whitespace-pre-wrap">{v}</p>
        ) : (
          // Empty state — muted text, italic to read as a
          // hint, no `border` so the page chrome doesn't
          // double-up. Same hierarchy as the rest of the
          // empty placeholders on the page.
          <p className="text-body text-fg-muted italic">
            No brief yet — click the pencil to add one.
          </p>
        )
      }
      renderEditor={({ value, onChange }) => {
        const len = value.length;
        const overWarn = len >= BRIEF_WARN;
        const atMax = len >= BRIEF_MAX;
        return (
          <div className="space-y-1">
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              rows={6}
              maxLength={BRIEF_MAX}
              // The counter sits *outside* the textarea so it
              // never blocks the user's reading line; the
              // colour class is reactive to the current length
              // (state flows in via the `value` prop from the
              // parent field component).
              className={cn(INPUT_CHROME, "resize-y")}
              placeholder="Goal, audience, key points. Up to 2 000 characters."
              aria-describedby="inline-edit-brief-counter"
              data-testid="inline-edit-brief-textarea"
            />
            <p
              id="inline-edit-brief-counter"
              data-testid="inline-edit-brief-counter"
              aria-live="polite"
              className={cn(
                "text-label text-fg-muted text-end tabular-nums",
                overWarn && !atMax && "text-warning",
                atMax && "text-danger font-semibold",
              )}
            >
              {len.toLocaleString()} / {BRIEF_MAX.toLocaleString()}
            </p>
          </div>
        );
      }}
      onSave={(next) => inlineUpdateBriefAction(workspaceSlug, contentItemId, next)}
    />
  );
}

/**
 * Title inline editor. View mode shows the title with the same
 * "font-semibold" treatment the page uses outside the field.
 * Edit mode is a single-line text input capped at 200 chars
 * (matches `TitleUpdateSchema.title`) with a live `X / 200`
 * counter.
 */
const TITLE_MAX = 200;
const TITLE_WARN = Math.floor(TITLE_MAX * 0.9); // 180
export function InlineTitleEditor({
  workspaceSlug,
  contentItemId,
  value,
}: {
  workspaceSlug: string;
  contentItemId: string;
  value: string;
}) {
  return (
    <InlineEditableField
      testId="inline-edit-title"
      label="title"
      value={value}
      render={(v) => <p className="text-body text-fg-primary font-semibold">{v}</p>}
      renderEditor={({ value, onChange }) => {
        const len = value.length;
        const overWarn = len >= TITLE_WARN;
        const atMax = len >= TITLE_MAX;
        return (
          <div className="space-y-1">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              maxLength={TITLE_MAX}
              className={cn(INPUT_CHROME, "h-10")}
              aria-describedby="inline-edit-title-counter"
              data-testid="inline-edit-title-input"
            />
            <p
              id="inline-edit-title-counter"
              data-testid="inline-edit-title-counter"
              aria-live="polite"
              className={cn(
                "text-label text-fg-muted text-end tabular-nums",
                overWarn && !atMax && "text-warning",
                atMax && "text-danger font-semibold",
              )}
            >
              {len} / {TITLE_MAX}
            </p>
          </div>
        );
      }}
      onSave={(next) => inlineUpdateTitleAction(workspaceSlug, contentItemId, next)}
    />
  );
}

/**
 * Planned-publish-date inline editor. The server passes the
 * date as an ISO string and the workspace's IANA timezone.
 *
 * Why ISO + timezone as separate props (not a Date object):
 *  - The page already does `item.plannedPublishAt.toISOString()`
 *    to feed `InlineEditableField`; the buffer round-trips as a
 *    string, and the editor formats it back with
 *    `formatDateForInput` (local-clock YYYY-MM-DDTHH:mm) for the
 *    `<input type="datetime-local">`. The user's local clock
 *    differs from the server's UTC, so the helpers in
 *    `lib/utils/date.ts` are necessary to keep "9 AM" looking
 *    like "9 AM" when the user changes timezones.
 *  - `ws.timezone` is rendered as a label next to the value so
 *    the user always knows which timezone the date is in.
 */
export function InlineDateEditor({
  workspaceSlug,
  contentItemId,
  value,
  timezone,
}: {
  workspaceSlug: string;
  contentItemId: string;
  /** ISO-8601 string for the planned publish instant. */
  value: string;
  /** IANA timezone label, e.g. "Europe/Berlin". */
  timezone: string;
}) {
  return (
    <InlineEditableField
      testId="inline-edit-date"
      label="planned publish date"
      value={value}
      render={(v) => (
        <p className="text-body text-fg-primary">
          {new Date(v).toLocaleString()}{" "}
          <span className="text-label text-fg-muted">· {timezone}</span>
        </p>
      )}
      renderEditor={({ value, onChange }) => (
        <div className="space-y-1">
          <input
            type="datetime-local"
            value={formatDateForInput(value)}
            onChange={(e) => onChange(parseInputAsLocalDate(e.target.value).toISOString())}
            // Shared focus ring + padding with the other
            // editors so the page reads as one surface.
            className={cn(INPUT_CHROME, "h-10")}
            aria-describedby="inline-edit-date-timezone"
            data-testid="inline-edit-date-input"
          />
          <p
            id="inline-edit-date-timezone"
            data-testid="inline-edit-date-timezone"
            className="text-label text-fg-muted"
          >
            {/* Re-state the workspace timezone in the editor
                so the user never types a "9 AM" in their local
                clock and forgets the value is stored in
                {timezone}. The view-mode label also says
                this, but the editor is the place the user
                actually decides what to type. */}
            Times are in your local clock. Stored as{" "}
            <span className="font-semibold">{timezone}</span>.
          </p>
        </div>
      )}
      onSave={(next) => inlineUpdateDateAction(workspaceSlug, contentItemId, new Date(next))}
    />
  );
}
