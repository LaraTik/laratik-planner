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
  { id: "lifecycle", labelKey: "settings.kpi.lifecycle" },
  { id: "lead-times", labelKey: "settings.kpi.leadTimes" },
  { id: "defaults", labelKey: "settings.kpi.defaults" },
  { id: "approvals", labelKey: "settings.kpi.approvals" },
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
  t,
}: {
  slug: string;
  current: SettingsSectionId;
  configured?: SettingsConfiguredMap;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const currentIndex = SETTINGS_SECTIONS.findIndex((s) => s.id === current);
  const prev = currentIndex > 0 ? SETTINGS_SECTIONS[currentIndex - 1] : null;
  const next =
    currentIndex < SETTINGS_SECTIONS.length - 1 ? SETTINGS_SECTIONS[currentIndex + 1] : null;
  const stepNumber = currentIndex + 1;
  const totalSteps = SETTINGS_SECTIONS.length;

  return (
    <nav
      className="border-border bg-surface-subtle flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border p-3"
      aria-label={t("settings.sectionNav.ariaLabel")}
      data-testid="settings-section-nav"
    >
      <ol
        className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
        aria-label={t("settings.stepAria", { current: stepNumber, total: totalSteps })}
      >
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
                  "text-label inline-flex min-h-11 items-center gap-1 rounded-full px-2 font-semibold transition-colors",
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
                <span>{t(s.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
        {prev ? (
          <Link
            href={hrefFor(slug, prev.id)}
            data-testid="settings-section-nav-prev"
            className="text-label text-fg-secondary hover:text-fg-primary hover:border-border inline-flex min-h-11 min-w-0 items-center gap-1 rounded-[var(--radius-control)] border border-transparent px-2 font-semibold transition-colors"
          >
            <DirAwareArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t(prev.labelKey)}
          </Link>
        ) : (
          <span className="text-label text-fg-muted inline-flex min-h-11 items-center gap-1 px-2">
            <DirAwareArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t("settings.sectionNav.noPrevious")}
          </span>
        )}
        {next ? (
          <Link
            href={hrefFor(slug, next.id)}
            data-testid="settings-section-nav-next"
            className="text-label text-primary border-border bg-surface hover:bg-primary-subtle inline-flex min-h-11 min-w-0 items-center gap-1 rounded-[var(--radius-control)] border px-2.5 font-semibold transition-colors"
          >
            {t("settings.sectionNav.next", { label: t(next.labelKey) })}
            <DirAwareArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <span className="text-label text-fg-muted inline-flex min-h-11 items-center gap-1 px-2 font-semibold">
            {t("settings.sectionNav.lastStep")}
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}
