import { redirect, notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { listBrandPublishingRules } from "@/lib/brand/service";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { SectionCard } from "@/components/workspace/section-card";
import { BrandKitHealth } from "../_components/brand-kit-health";
import { BrandKitBackLink } from "../_components/brand-kit-back-link";
import { PublishingRuleForm } from "../publishing-rule-form";
import { PublishingRuleList } from "../publishing-rule-list";

/**
 * /app/w/[slug]/brand-kit/publishing — the Publishing Rules
 * section (Phase 7). Publishing rules are the editorial
 * guardrails the AI should follow at draft time (alt text
 * conventions, hashtag norms, compliance reminders). Phase 8
 * wires these into `loadAiContext` so the AI generation route
 * has access to them when the planner ticks the brand-kit
 * toggle.
 */
export default async function BrandKitPublishingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { t } = await tForActive();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const canEditBrand = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
    "content_planner",
  ]);

  const rules = await listBrandPublishingRules(workspace.id);

  return (
    <div className="space-y-6">
      <BrandKitBackLink slug={slug} />
      <PageHeader
        eyebrow={t("brandKit.publishingEyebrow")}
        title={t("brandKit.publishingTitle")}
        description={t("brandKit.publishingDescription")}
      />
      <BrandKitHealth section="publishing" slug={slug} count={rules.length} />

      <SectionCard
        id="publishing"
        title={
          <>
            <BookOpen className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            Rules
          </>
        }
        count={rules.length}
        fullWidth
        aria-label={t("brandKit.publishingAria")}
        data-testid="brand-kit-section-publishing"
      >
        {canEditBrand ? <PublishingRuleForm slug={slug} /> : null}
        <PublishingRuleList slug={slug} canManage={canEditBrand} rules={rules} t={t} />
      </SectionCard>
    </div>
  );
}
