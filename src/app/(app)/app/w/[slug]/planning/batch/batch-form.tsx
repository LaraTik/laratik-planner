"use client";
import { useActionState, useMemo, useState } from "react";
import { batchCreateAction } from "../actions";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { parseBatchRows } from "@/lib/content/batch";

/**
 * Batch add form. Each line is one content item. The v1
 * format was `title | format | date | brief`; the v2 format
 * (added in the format-payload editor commit) extends with
 * three optional trailing fields:
 *
 *   title | format | date | brief | caption | #tag1 #tag2 | "Dubai Mall" | "fb-123"
 *
 * The preview below the textarea shows the parsed row count
 * + per-line errors before the planner submits, so a row with
 * an over-length caption or unknown format shows up inline
 * instead of failing the whole batch on the server.
 *
 * The textarea itself uses a `dir="auto"`-style fallback: the
 * page-level `dir` attribute is set by the layout from the
 * active agency locale, so a workspace with `locale: "ar"`
 * gets RTL text in the input without the planner flipping
 * anything.
 */
export function BatchForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(
    batchCreateAction.bind(null, slug),
    {} as { error?: string },
  );
  const [rows, setRows] = useState<string>("");
  const parsed = useMemo(() => parseBatchRows(rows), [rows]);
  const errorCount = parsed.filter((r) => "parseError" in r).length;

  return (
    <form action={action} className="space-y-4">
      <label className="text-body block font-semibold" htmlFor="rows">
        One idea per line
      </label>
      <textarea
        id="rows"
        name="rows"
        required
        rows={12}
        value={rows}
        onChange={(e) => setRows(e.target.value)}
        className="border-border bg-surface text-body w-full rounded-[var(--radius-control)] border p-3 font-mono"
        placeholder={
          "Launch teaser | short_form_video | 2026-09-01T09:00:00Z | Reveal the new collection\n" +
          "Behind the scenes | story | 2026-09-03T12:00:00Z | A walkthrough of the studio\n" +
          "# advanced — caption, hashtags, location:\n" +
          "Spring drop | static_post | 2026-09-05T09:00:00Z | The reveal | Pre-order now | #spring #drop | Dubai Mall|fb-123"
        }
      />
      {rows.trim().length > 0 ? (
        <p className="text-label text-fg-muted" data-testid="batch-row-count">
          {parsed.length} row{parsed.length === 1 ? "" : "s"} parsed
          {errorCount > 0 ? ` · ${errorCount} with errors` : ""}
        </p>
      ) : null}
      {errorCount > 0 ? (
        <ul
          className="border-danger-subtle bg-danger-subtle text-label text-danger space-y-1 rounded-[var(--radius-control)] border p-2"
          data-testid="batch-row-errors"
        >
          {parsed
            .filter((r) => "parseError" in r)
            .slice(0, 10)
            .map((r) => (
              <li key={r.lineNumber}>
                Row {r.lineNumber}: {"parseError" in r ? r.parseError : ""}
              </li>
            ))}
        </ul>
      ) : null}
      {state?.error ? (
        <p role="alert" className="text-label text-danger font-semibold">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <FormSubmitButton label="Create drafts" pendingLabel="Creating…" />
        <Button variant="ghost" asChild>
          <a href={`/app/w/${slug}/planning`}>Cancel</a>
        </Button>
      </div>
    </form>
  );
}
