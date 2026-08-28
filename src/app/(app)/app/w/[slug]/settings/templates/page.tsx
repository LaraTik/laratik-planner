import { redirect, notFound } from "next/navigation";
import { Clock, CheckCircle2, Hash } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { PageHeader } from "@/components/workspace/page-header";
import { SettingsBackLink } from "../_components/settings-back-link";
import { SettingsTemplateCard } from "../_components/settings-template-card";
import {
  approvalTemplates,
  leadTimeTemplates,
  monthlyTargetTemplates,
  settingsTemplateSections,
} from "@/lib/workspaces/settings-templates";

/**
 * /app/w/[slug]/settings/templates — the settings preset
 * library (Phase C). One-click "Apply preset" cards for the
 * 3 things that almost every new workspace has to set:
 *
 *   - Lead time presets (Fast / Standard / Relaxed / Agency + client)
 *   - Approval mode presets (Internal only / Internal + client)
 *   - Monthly target presets (3/wk, 5/wk, daily, 2x/day)
 *
 * The lead-time presets respect the existing approvalMode
 * (e.g. applying the 'Agency + client' preset also flips the
 * approvalMode to `internal_then_client`).
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

  return (
    <div className="space-y-8">
      <SettingsBackLink slug={slug} />
      <PageHeader
        title="Settings presets"
        description="Curated preset values for the four numbers every new workspace has to set. Pick a preset, apply it, edit any number before saving."
      />

      <TemplateSection
        icon={Clock}
        title="Lead time presets"
        blurb="Curated 4-number presets for common agency cadences. Applying a lead-time preset also adjusts the approval mode when the preset is designed for a client-approval workflow."
        testId="settings-template-section-lead-times"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {leadTimeTemplates.map((t) => {
            const total =
              t.values.contentApprovalLeadDays +
              t.values.designCompleteLeadDays +
              t.values.creativeApprovalLeadDays +
              t.values.readyToPublishLeadDays;
            return (
              <SettingsTemplateCard
                key={t.id}
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
                {...(t.forClientApproval
                  ? { hint: "This preset flips approval mode to 'Internal, then client'." }
                  : {})}
              />
            );
          })}
        </div>
      </TemplateSection>

      <TemplateSection
        icon={CheckCircle2}
        title="Approval mode presets"
        blurb="The two approval flows the workspace supports."
        testId="settings-template-section-approvals"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {approvalTemplates.map((t) => (
            <SettingsTemplateCard
              key={t.id}
              kind="approvals"
              slug={slug}
              templateId={t.id}
              title={t.label}
              blurb={t.blurb}
            />
          ))}
        </div>
      </TemplateSection>

      <TemplateSection
        icon={Hash}
        title="Monthly target presets"
        blurb="Common post-per-month targets the planning KPI bar uses to colour on-track / at-risk / off-track."
        testId="settings-template-section-monthly-target"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {monthlyTargetTemplates.map((t) => (
            <SettingsTemplateCard
              key={t.id}
              kind="monthly-target"
              slug={slug}
              templateId={t.id}
              title={t.name}
              blurb={t.blurb}
              preview={
                <span className="border-border bg-primary-subtle text-primary text-label rounded-full border px-2.5 py-0.5 font-bold">
                  {t.value} / month
                </span>
              }
            />
          ))}
        </div>
      </TemplateSection>

      {!canManage ? (
        <p className="text-label text-fg-muted text-center" role="status">
          You need workspace-manager access to apply presets.
        </p>
      ) : null}
    </div>
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
