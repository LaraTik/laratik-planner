import * as React from "react";
import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { DirAwareArrowLeft, DirAwareArrowRight } from "@/components/ui/dir-aware-icon";
import { cn } from "@/lib/utils";

/**
 * Settings section order — the canonical "new workspace setup"
 * sequence. Used by `SettingsSectionNav` to render the prev /
 * next links on every per-section page so the user can
 * walk the whole flow without bouncing to the sidebar.
 *
 * Order rationale:
 *   1. Lifecycle  — identity (timezone + monthly target).
 *   2. Lead times — workflow buffers, derived from cadence.
 *   3. Defaults   — the people who'll actually use the buffers.
 *   4. Approvals  — last: which stakeholders sign off.
 *
 * Templates is intentionally NOT in the linear flow — it's a
 * shortcut surface, not a setup step.
 */
export const SETTINGS_SECTIONS = [
  { id: "lifecycle", label: "Lifecycle", href: "" },
  { id: "lead-times", label: "Lead times", href: "" },
  { id: "defaults", label: "Defaults", href: "" },
  { id: "approvals", label: "Approval mode", href: "" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

function hrefFor(slug: string, section: SettingsSectionId): string {
  if (section === "lifecycle") return `/app/w/${slug}/settings/lifecycle`;
  return `/app/w/${slug}/settings/${section}`;
}

/**
 * Per-section configuration status, computed at render time
 * by the per-section page (which has the live values). The
 * nav reads this map to decide which step is "done" (green
 * check), which is the current step (primary pill), and
 * which is still pending (muted circle). Without this map
 * the step indicator is just a position counter; with it,
 * the indicator becomes a real progress signal that
 * matches the overview's `SettingsSetupChecklist`.
 */
export type SettingsConfiguredMap = Partial<Record<SettingsSectionId, boolean>>;

export function SettingsSectionNav({
  slug,
  current,
  configured,
}: {
  slug: string;
  current: SettingsSectionId;
  configured?: SettingsConfiguredMap;
}) {
  const currentIndex = SETTINGS_SECTIONS.findIndex((s) => s.id === current);
  const prev = currentIndex > 0 ? SETTINGS_SECTIONS[currentIndex - 1] : null;
  const next =
    currentIndex < SETTINGS_SECTIONS.length - 1 ? SETTINGS_SECTIONS[currentIndex + 1] : null;
  const stepNumber = currentIndex + 1;
  const totalSteps = SETTINGS_SECTIONS.length;

  return (
    <div
      className="border-border bg-surface-subtle flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border p-3"
      data-testid="settings-section-nav"
    >
      <ol className="flex items-center gap-1" aria-label={`Step ${stepNumber} of ${totalSteps}`}>
        {SETTINGS_SECTIONS.map((s, i) => {
          const isConfigured = configured?.[s.id] === true;
          const done = isConfigured || i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={s.id} className="flex items-center gap-1">
              {i > 0 ? <span className="bg-border mx-0.5 h-px w-4" aria-hidden="true" /> : null}
              <Link
                href={hrefFor(slug, s.id)}
                aria-current={active ? "step" : undefined}
                data-testid={`settings-section-nav-step-${s.id}`}
                data-configured={isConfigured ? "true" : "false"}
                className={cn(
                  "text-label inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "text-success hover:bg-surface"
                      : "text-fg-muted hover:bg-surface",
                )}
              >
                <span aria-hidden="true">
                  {isConfigured ? (
                    <Check className="h-3 w-3" />
                  ) : done ? (
                    <Check className="h-3 w-3" />
                  ) : i + 1 === currentIndex + 1 && i === currentIndex ? (
                    <Circle className="h-2 w-2 fill-current" />
                  ) : (
                    <Circle className="h-2 w-2 fill-current opacity-40" />
                  )}
                </span>
                <span>{s.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-2">
        {prev ? (
          <Link
            href={hrefFor(slug, prev.id)}
            data-testid="settings-section-nav-prev"
            className="text-label text-fg-secondary hover:text-fg-primary hover:border-border inline-flex items-center gap-1 rounded-[var(--radius-control)] border border-transparent px-2 py-1 font-semibold transition-colors"
          >
            <DirAwareArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {prev.label}
          </Link>
        ) : (
          <span className="text-label text-fg-muted inline-flex items-center gap-1 px-2 py-1">
            <DirAwareArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            No previous section
          </span>
        )}
        {next ? (
          <Link
            href={hrefFor(slug, next.id)}
            data-testid="settings-section-nav-next"
            className="text-label text-primary border-border bg-surface hover:bg-primary-subtle inline-flex items-center gap-1 rounded-[var(--radius-control)] border px-2.5 py-1 font-semibold transition-colors"
          >
            Next: {next.label}
            <DirAwareArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <span className="text-label text-fg-muted inline-flex items-center gap-1 px-2 py-1 font-semibold">
            Last step
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );
}
