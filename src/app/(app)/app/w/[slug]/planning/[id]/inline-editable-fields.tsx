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

/**
 * Brief inline editor. View mode shows the brief as pre-wrapped
 * text, or a muted placeholder when empty. Edit mode is a
 * 6-row textarea capped at 2_000 chars (matches
 * `BriefUpdateSchema.brief` in `lib/content/inline-update.ts`).
 */
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
      render={(v) => (
        <p className="text-body text-fg-primary whitespace-pre-wrap">{v ? v : "No brief yet."}</p>
      )}
      renderEditor={({ value, onChange }) => (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          maxLength={2000}
          className="border-border bg-surface text-fg-primary text-body w-full rounded-[var(--radius-control)] border px-3 py-2"
          placeholder="Goal, audience, key points."
          data-testid="inline-edit-brief-textarea"
        />
      )}
      onSave={(next) => inlineUpdateBriefAction(workspaceSlug, contentItemId, next)}
    />
  );
}

/**
 * Title inline editor. View mode shows the title with the same
 * "font-semibold" treatment the page uses outside the field.
 * Edit mode is a single-line text input capped at 200 chars
 * (matches `TitleUpdateSchema.title`).
 */
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
      renderEditor={({ value, onChange }) => (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={200}
          className="border-border bg-surface text-fg-primary text-body h-10 w-full rounded-[var(--radius-control)] border px-3 py-2"
          data-testid="inline-edit-title-input"
        />
      )}
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
        <input
          type="datetime-local"
          value={formatDateForInput(value)}
          onChange={(e) => onChange(parseInputAsLocalDate(e.target.value).toISOString())}
          className="border-border bg-surface text-fg-primary text-body h-10 w-full rounded-[var(--radius-control)] border px-3 py-2"
          data-testid="inline-edit-date-input"
        />
      )}
      onSave={(next) => inlineUpdateDateAction(workspaceSlug, contentItemId, new Date(next))}
    />
  );
}
