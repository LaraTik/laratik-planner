/**
 * Tiny line-level diff for the AI Replace flow.
 *
 * The §15 spec is "drafts only — human inserts or replaces" but
 * Replace silently overwrites `contentItem.brief`, which means
 * the planner can lose a working brief with one misclick. This
 * component is the cheapest meaningful safety net: it shows the
 * current brief above the proposed draft, marks which side is
 * the original and which is the new one, and gates Replace
 * behind an explicit confirm checkbox. We deliberately do NOT
 * implement a real Myers diff — a brief is short (5-15 lines)
 * and the model typically rewrites the whole thing, so a
 * line-level +/- display would just show "remove all + add all".
 *
 * The component is presentational — it does not own the
 * confirm state. The parent passes `confirmed` and
 * `onConfirmedChange` so the Replace button can stay disabled
 * until the planner ticks the box. This is the same pattern
 * shadcn/ui uses for destructive dialogs.
 */
"use client";

import * as React from "react";
import { FileText, Sparkles } from "lucide-react";
import { DirAwareArrowRight } from "@/components/ui/dir-aware-icon";
import { Checkbox } from "@/components/ui/checkbox";

export function DiffPreview({
  before,
  after,
  beforeLabel,
  afterLabel,
  confirmed,
  onConfirmedChange,
  confirmId,
  testIdPrefix = "ai-diff",
}: {
  before: string;
  after: string;
  /** Label for the "before" block (e.g. "Current brief"). */
  beforeLabel: string;
  /** Label for the "after" block (e.g. "AI draft"). */
  afterLabel: string;
  /** Whether the planner has ticked the "I understand this replaces the brief" checkbox. */
  confirmed: boolean;
  onConfirmedChange: (next: boolean) => void;
  /** Used as the checkbox `id` so the label `htmlFor` resolves. Defaults to a stable string. */
  confirmId?: string;
  testIdPrefix?: string;
}) {
  const id = confirmId ?? `${testIdPrefix}-confirm`;
  const beforeLines = before.length === 0 ? ["(empty)"] : before.split("\n");
  const afterLines = after.length === 0 ? ["(empty)"] : after.split("\n");
  // The model rewrites the whole brief ~95% of the time, so a
  // per-line diff would be noise. We show both blocks whole
  // and call out the line-count delta — that's the most
  // informative "this will change" signal for a brief.
  const lineDelta = afterLines.length - beforeLines.length;
  const charDelta = after.length - before.length;
  return (
    <div
      className="border-border bg-surface mt-3 space-y-3 rounded-[var(--radius-control)] border p-3"
      data-testid={testIdPrefix}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <DiffSide
          label={beforeLabel}
          icon={<FileText className="text-fg-muted h-3.5 w-3.5" aria-hidden="true" />}
          lines={beforeLines}
          variant="muted"
          testId={`${testIdPrefix}-before`}
        />
        <DiffSide
          label={afterLabel}
          icon={<Sparkles className="text-primary h-3.5 w-3.5" aria-hidden="true" />}
          lines={afterLines}
          variant="primary"
          testId={`${testIdPrefix}-after`}
        />
      </div>
      <p
        className="text-label text-fg-muted flex flex-wrap items-center gap-2"
        data-testid={`${testIdPrefix}-summary`}
      >
        <DirAwareArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        {lineDelta === 0 && charDelta === 0
          ? "No size change."
          : `${lineDelta > 0 ? "+" : ""}${lineDelta} line${Math.abs(lineDelta) === 1 ? "" : "s"}, ${charDelta > 0 ? "+" : ""}${charDelta} character${Math.abs(charDelta) === 1 ? "" : "s"}.`}
      </p>
      <div
        className="border-border bg-warning-soft text-body text-fg-primary flex items-start gap-2 rounded-[var(--radius-control)] border p-3"
        data-testid={`${testIdPrefix}-confirm-row`}
      >
        <Checkbox
          id={id}
          checked={confirmed}
          onCheckedChange={(checked) => onConfirmedChange(checked === true)}
          className="mt-0.5"
          data-testid={`${testIdPrefix}-confirm`}
        />
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
          <span className="block font-semibold">
            I understand this will replace the current brief.
          </span>
          <span className="text-fg-secondary block">
            The previous text is shown above; the new text below. Once you confirm, the new text
            becomes the live brief.
          </span>
        </label>
      </div>
    </div>
  );
}

function DiffSide({
  label,
  icon,
  lines,
  variant,
  testId,
}: {
  label: string;
  icon: React.ReactNode;
  lines: string[];
  variant: "muted" | "primary";
  testId: string;
}) {
  const isPrimary = variant === "primary";
  return (
    <div
      className={`flex flex-col gap-1 rounded-[var(--radius-control)] border p-2 ${
        isPrimary ? "border-primary/40 bg-primary-subtle/40" : "border-border bg-surface-subtle"
      }`}
      data-testid={testId}
    >
      <p
        className={`text-label flex items-center gap-1 font-semibold ${
          isPrimary ? "text-primary" : "text-fg-muted"
        }`}
      >
        {icon}
        {label}
      </p>
      <pre className="text-body text-fg-primary font-sans whitespace-pre-wrap">
        {lines.join("\n")}
      </pre>
    </div>
  );
}
