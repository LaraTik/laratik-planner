import * as React from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityDiff as ActivityDiffSpec } from "@/lib/activity/types";

/**
 * ActivityDiff — renders a before → after diff for a single field.
 *
 * Two shapes:
 *
 *   - `chip`  : short values (status, date, name). Two pills with an
 *               arrow between them. Tone-coded (warning when reverting,
 *               success when promoting). Default for status transitions,
 *               reschedules, assignment changes.
 *
 *   - `text`  : long values (brief, title, copy). A collapsible
 *               `<details>` with a `<del>` (strikethrough) and
 *               `<ins>` (underline) on two stacked lines. The native
 *               `<details>` toggle gives us free keyboard / SR
 *               accessibility; the open-by-default behavior keeps
 *               the diff visible without an extra click.
 */

const COLLAPSE_THRESHOLD = 220;

export interface ActivityDiffProps {
  diff: ActivityDiffSpec;
}

export function ActivityDiff({ diff }: ActivityDiffProps) {
  if (diff.shape === "text") {
    return <TextDiff diff={diff} />;
  }
  return <ChipDiff diff={diff} />;
}

function ChipDiff({ diff }: { diff: ActivityDiffSpec }) {
  const tone = chipTone(diff);
  return (
    <div
      className="text-label mt-1 flex flex-wrap items-center gap-1.5"
      data-testid="activity-diff-chip"
      data-diff-field={diff.field}
    >
      <span className="text-fg-muted">{diff.fieldLabel}:</span>
      <span
        className={cn(
          "bg-surface inline-flex items-center rounded-full border px-2 py-0.5 font-mono",
          tone.before,
        )}
        data-testid="activity-diff-before"
      >
        {diff.before.label || "—"}
      </span>
      <ArrowRight className="text-fg-muted h-3 w-3" aria-hidden="true" />
      <span
        className={cn(
          "bg-surface inline-flex items-center rounded-full border px-2 py-0.5 font-mono",
          tone.after,
        )}
        data-testid="activity-diff-after"
      >
        {diff.after.label || "—"}
      </span>
      {diff.unchanged ? <span className="text-fg-muted ms-1">(unchanged)</span> : null}
    </div>
  );
}

function TextDiff({ diff }: { diff: ActivityDiffSpec }) {
  const beforeText = diff.before.label || "";
  const afterText = diff.after.label || "";
  const isLong = beforeText.length > COLLAPSE_THRESHOLD || afterText.length > COLLAPSE_THRESHOLD;
  if (isLong) {
    return (
      <details
        className="text-body mt-1"
        data-testid="activity-diff-text"
        data-diff-field={diff.field}
        open
      >
        <summary className="text-label text-fg-muted cursor-pointer select-none">
          {diff.fieldLabel}
        </summary>
        <div className="mt-1 space-y-1">
          <div className="border-danger/30 bg-danger-subtle text-danger rounded-[var(--radius-control)] border px-2 py-1.5">
            <span className="text-fg-muted text-label me-1">−</span>
            <span className="line-through" data-testid="activity-diff-before">
              {beforeText || <em className="text-fg-muted">(empty)</em>}
            </span>
          </div>
          <div className="border-success/30 bg-success-subtle text-success rounded-[var(--radius-control)] border px-2 py-1.5">
            <span className="text-fg-muted text-label me-1">+</span>
            <span
              className="underline decoration-2 underline-offset-4"
              data-testid="activity-diff-after"
            >
              {afterText || <em className="text-fg-muted">(empty)</em>}
            </span>
          </div>
        </div>
      </details>
    );
  }
  return (
    <div
      className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_auto_1fr]"
      data-testid="activity-diff-text"
      data-diff-field={diff.field}
    >
      <div className="border-danger/30 bg-danger-subtle text-danger rounded-[var(--radius-control)] border px-2 py-1.5">
        <span className="text-fg-muted text-label me-1">{diff.fieldLabel} −</span>
        <span className="line-through" data-testid="activity-diff-before">
          {beforeText || <em className="text-fg-muted">(empty)</em>}
        </span>
      </div>
      <div className="text-fg-muted self-center justify-self-center" aria-hidden="true">
        <ArrowRight className="h-3.5 w-3.5" />
      </div>
      <div className="border-success/30 bg-success-subtle text-success rounded-[var(--radius-control)] border px-2 py-1.5">
        <span className="text-fg-muted text-label me-1">+</span>
        <span
          className="underline decoration-2 underline-offset-4"
          data-testid="activity-diff-after"
        >
          {afterText || <em className="text-fg-muted">(empty)</em>}
        </span>
      </div>
    </div>
  );
}

/** Pick tone for the chips. Status promotions = success,
 *  regressions = warning, name changes = neutral. */
function chipTone(diff: ActivityDiffSpec): {
  before: string;
  after: string;
} {
  if (diff.field === "status") {
    return chipToneForStatus(diff);
  }
  return { before: "", after: "" };
}

const STATUS_ORDER: Record<string, number> = {
  draft: 0,
  content_review: 1,
  approved_for_design: 2,
  in_design: 3,
  creative_review: 4,
  changes_requested: -1,
  blocked: -2,
  ready_to_publish: 5,
  partially_published: 6,
  published: 7,
  cancelled: -3,
};

function chipToneForStatus(diff: ActivityDiffSpec): { before: string; after: string } {
  const beforeOrder = STATUS_ORDER[normalize(diff.before.label)] ?? 0;
  const afterOrder = STATUS_ORDER[normalize(diff.after.label)] ?? 0;
  const promoting = afterOrder > beforeOrder;
  const regressing = afterOrder < beforeOrder;
  if (promoting) {
    return {
      before: "border-border text-fg-secondary",
      after: "border-success/30 bg-success-subtle text-success",
    };
  }
  if (regressing) {
    return {
      before: "border-border text-fg-secondary",
      after: "border-warning/30 bg-warning-subtle text-warning",
    };
  }
  return {
    before: "border-border text-fg-secondary",
    after: "border-border text-fg-secondary",
  };
}

function normalize(label: string): string {
  return label.toLowerCase().replace(/[\s_-]+/g, "_");
}
