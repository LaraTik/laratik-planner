import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Clock, CheckCircle2, Hash, ArrowDown, ArrowUp, Equal, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { workspaceSettings as workspaceSettingsTable } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { PageHeader } from "@/components/workspace/page-header";
import { SettingsTemplateCard } from "../_components/settings-template-card";
import {
  approvalTemplates,
  leadTimeTemplates,
  monthlyTargetTemplates,
  settingsTemplateSections,
} from "@/lib/workspaces/settings-templates";
import { cn } from "@/lib/utils";

/**
 * /app/w/[slug]/settings/templates — the settings preset
 * library (Phase C + D).
 *
 * Phase D adds a "current vs preset" diff on every card so the
 * user can see what changes before applying. Each card gets a
 * small delta badge:
 *   - lead times: −4 days from your current 18 / +6 days / same
 *   - approval mode: 'Different from current' / 'Same as current'
 *   - monthly target: '+12 from your current 12' / '−6 from …' /
 *                     'Set for the first time' (when current is null)
 *
 * The diff is computed at render time from the live
 * `workspace_settings` row. No additional round-trips.
 */
export default async function SettingsTemplatesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const canManage = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
  ]);
  const [settings] = await db
    .select()
    .from(workspaceSettingsTable)
    .where(eq(workspaceSettingsTable.workspaceId, workspace.id))
    .limit(1);

  const currentLeadTotal = settings
    ? settings.contentApprovalLeadDays +
      settings.designCompleteLeadDays +
      settings.creativeApprovalLeadDays +
      settings.readyToPublishLeadDays
    : 18; // DB default
  const currentApprovalMode = settings?.approvalMode ?? "simple";
  const currentMonthlyTarget = settings?.monthlyTarget ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings presets"
        description="Curated preset values for the four numbers every new workspace has to set. Each card shows the delta against your current settings so you can see what changes before applying."
      />

      <TemplateSection
        icon={Clock}
        title="Lead time presets"
        blurb="Curated 4-number presets for common agency cadences. Applying a lead-time preset also adjusts the approval mode when the preset is designed for a client-approval workflow."
        testId="settings-template-section-lead-times"
      >
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {leadTimeTemplates.map((t) => {
            const total =
              t.values.contentApprovalLeadDays +
              t.values.designCompleteLeadDays +
              t.values.creativeApprovalLeadDays +
              t.values.readyToPublishLeadDays;
            const delta = total - currentLeadTotal;
            return (
              <li key={t.id}>
                <SettingsTemplateCard
                  kind="lead-times"
                  slug={slug}
                  templateId={t.id}
                  title={t.name}
                  blurb={t.blurb}
                  preview={
                    <ul className="text-label text-fg-muted flex flex-wrap gap-x-3 gap-y-1">
                      <li>Content {t.values.contentApprovalLeadDays}d</li>
                      <li>Design {t.values.designCompleteLeadDays}d</li>
                      <li>Creative {t.values.creativeApprovalLeadDays}d</li>
                      <li>Publish {t.values.readyToPublishLeadDays}d</li>
                    </ul>
                  }
                  meta={`${total} business days total`}
                  delta={
                    <DeltaBadge
                      delta={delta}
                      label="days"
                      currentTotal={currentLeadTotal}
                      presetTotal={total}
                    />
                  }
                  {...(t.forClientApproval
                    ? { hint: "This preset flips approval mode to 'Internal, then client'." }
                    : {})}
                />
              </li>
            );
          })}
        </ul>
      </TemplateSection>

      <TemplateSection
        icon={CheckCircle2}
        title="Approval mode presets"
        blurb="The two approval flows the workspace supports."
        testId="settings-template-section-approvals"
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {approvalTemplates.map((t) => (
            <li key={t.id}>
              <SettingsTemplateCard
                kind="approvals"
                slug={slug}
                templateId={t.id}
                title={t.label}
                blurb={t.blurb}
                delta={
                  <DeltaBadge
                    delta={t.id === currentApprovalMode ? 0 : 1}
                    label={
                      t.id === currentApprovalMode
                        ? "Same as your current"
                        : "Different from your current"
                    }
                    kind="badge"
                  />
                }
              />
            </li>
          ))}
        </ul>
      </TemplateSection>

      <TemplateSection
        icon={Hash}
        title="Monthly target presets"
        blurb="Common post-per-month targets the planning KPI bar uses to colour on-track / at-risk / off-track."
        testId="settings-template-section-monthly-target"
      >
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {monthlyTargetTemplates.map((t) => {
            const delta = currentMonthlyTarget === null ? null : t.value - currentMonthlyTarget;
            return (
              <li key={t.id}>
                <SettingsTemplateCard
                  kind="monthly-target"
                  slug={slug}
                  templateId={t.id}
                  title={t.name}
                  blurb={t.blurb}
                  preview={
                    <span
                      className={cn(
                        "border-border text-label rounded-full border px-2.5 py-0.5 font-bold",
                        currentMonthlyTarget === t.value
                          ? "bg-success/15 text-success border-success/30"
                          : "bg-primary-subtle text-primary",
                      )}
                    >
                      {t.value} / month
                    </span>
                  }
                  delta={
                    delta === null ? (
                      <DeltaBadge delta={1} kind="badge" label="Set for the first time" />
                    ) : delta === 0 ? (
                      <DeltaBadge delta={0} kind="badge" label="Same as your current" />
                    ) : (
                      <DeltaBadge
                        delta={delta}
                        label="posts / month"
                        currentTotal={currentMonthlyTarget ?? 0}
                        presetTotal={t.value}
                      />
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      </TemplateSection>

      {!canManage ? (
        <p className="text-label text-fg-muted text-center" role="status">
          You need workspace-manager access to apply presets.
        </p>
      ) : null}
    </div>
  );
}

function DeltaBadge({
  delta,
  label,
  currentTotal,
  presetTotal,
  kind,
}: {
  delta: number;
  label?: string;
  currentTotal?: number;
  presetTotal?: number;
  kind?: "badge";
}) {
  // Label-only badge (approval mode, "set for the first time").
  if (kind === "badge" && label) {
    return (
      <span
        className={cn(
          "text-label inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold",
          delta === 0 ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
        )}
        data-testid="settings-template-delta"
      >
        {delta === 0 ? <Equal className="h-3 w-3" aria-hidden="true" /> : null}
        {label}
      </span>
    );
  }
  // Numeric delta (lead time days, monthly target posts).
  const Icon = delta < 0 ? ArrowDown : delta > 0 ? ArrowUp : Equal;
  const tone =
    delta < 0
      ? "bg-success/15 text-success"
      : delta > 0
        ? "bg-warning/15 text-warning"
        : "bg-surface text-fg-muted";
  return (
    <span
      className={cn(
        "text-label inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold",
        tone,
      )}
      data-testid="settings-template-delta"
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {delta === 0
        ? "Same as your current"
        : `${delta > 0 ? "+" : ""}${delta} ${label ?? ""} (${presetTotal} from ${currentTotal})`}
    </span>
  );
}

function TemplateSection({
  icon: Icon,
  title,
  blurb,
  testId,
  children,
}: {
  icon: typeof Clock;
  title: string;
  blurb: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="border-border bg-surface rounded-[var(--radius-card)] border p-4 sm:p-6"
      aria-labelledby={`${testId}-heading`}
      data-testid={testId}
    >
      <header className="mb-4 flex items-start gap-3">
        <span
          className="bg-primary-subtle text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)]"
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 id={`${testId}-heading`} className="text-section-title text-fg-primary font-semibold">
            {title}
          </h2>
          <p className="text-body text-fg-secondary">{blurb}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

void settingsTemplateSections;
void Sparkles;
