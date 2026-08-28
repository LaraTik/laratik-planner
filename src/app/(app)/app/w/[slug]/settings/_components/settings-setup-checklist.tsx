import * as React from "react";
import Link from "next/link";
import { Check, Circle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SettingsSetupChecklist — the "what still needs configuring"
 * surface for a workspace's settings.
 *
 * The KPI grid + the "Current configuration" list answer
 * "what IS configured" but they don't answer the more
 * important onboarding question: "what is still missing?".
 * The checklist collapses that answer into a single card with
 * one row per configured-or-not item, a progress count, and a
 * per-row jump to the right per-section page.
 *
 * Visibility: only rendered when at least one item is
 * unconfigured. A fully-configured workspace doesn't see the
 * checklist at all (the KPI grid is enough).
 */

type Item = {
  id: string;
  label: string;
  blurb: string;
  href: string;
  configured: boolean;
};

export interface SettingsSetupChecklistProps {
  items: Item[];
}

export function SettingsSetupChecklist({ items }: SettingsSetupChecklistProps) {
  const total = items.length;
  const configured = items.filter((i) => i.configured).length;
  const remaining = total - configured;
  if (remaining === 0) return null;

  return (
    <section
      className="border-border bg-surface rounded-[var(--radius-card)] border p-4 sm:p-6"
      aria-label="Settings setup checklist"
      data-testid="settings-setup-checklist"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-section-title text-fg-primary font-semibold">Setup checklist</h2>
          <p className="text-body text-fg-secondary">
            <span
              className="text-fg-primary font-bold"
              data-testid="settings-setup-checklist-progress"
            >
              {configured} of {total} sections configured
            </span>
            {remaining > 0 ? <span className="text-fg-muted"> — {remaining} to go</span> : null}
          </p>
        </div>
        <div
          className="text-label text-fg-muted flex items-center gap-1"
          aria-label={`${configured} of ${total} configured`}
        >
          {items.map((i) => (
            <span
              key={i.id}
              className={cn(
                "h-2 w-2 rounded-full",
                i.configured ? "bg-success" : "bg-surface-subtle border-border border",
              )}
              aria-hidden="true"
            />
          ))}
        </div>
      </header>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id}>
            <Link
              href={i.href}
              data-testid={`settings-setup-checklist-item-${i.id}`}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius-control)] border p-3 transition-colors",
                i.configured
                  ? "border-border bg-surface-subtle"
                  : "border-warning/30 bg-warning/5 hover:bg-warning/10",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  i.configured ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                )}
                aria-hidden="true"
              >
                {i.configured ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2 w-2" />}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "text-body block font-semibold",
                    i.configured ? "text-fg-secondary" : "text-fg-primary",
                  )}
                >
                  {i.label}
                </span>
                <span className="text-label text-fg-muted block">{i.blurb}</span>
              </span>
              <ArrowRight className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
