import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, eq, isNull } from "drizzle-orm";
import { MessageCircle } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { brandVoiceRules } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { SectionCard } from "@/components/workspace/section-card";
import { BrandKitHealth } from "../_components/brand-kit-health";
import { BrandKitBackLink } from "../_components/brand-kit-back-link";
import { VoiceForm } from "../voice-form";
import { VoiceRuleList } from "../voice-rule-list";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("sidebar.brandVoice") };
}

/**
 * /app/w/[slug]/brand-kit/voice — the Voice & tone section
 * (Phase 7). This is the only brand-kit section whose data is
 * already fed to the AI generation route via `loadAiContext`; the
 * Brand Kit Health card surfaces a coverage breakdown (tone / do
 * / don't) so the user can see at a glance which rule types
 * the AI has access to.
 */
export default async function BrandKitVoicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { t } = await tForActive();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const canManage = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
  ]);

  const rules = await db
    .select()
    .from(brandVoiceRules)
    .where(and(eq(brandVoiceRules.workspaceId, workspace.id), isNull(brandVoiceRules.archivedAt)))
    .orderBy(brandVoiceRules.sortOrder, brandVoiceRules.createdAt);

  // Per-rule-type breakdown so the Brand Kit Health card can show
  // the user which rule types the AI has positive vs negative
  // patterns for (Phase 7: surface the gap; Phase 8+: same data
  // also goes to the AI prompt via `loadAiContext`).
  const breakdown = {
    tone: rules.filter((r) => r.ruleType === "tone").length,
    do: rules.filter((r) => r.ruleType === "do").length,
    dont: rules.filter((r) => r.ruleType === "dont").length,
  };

  return (
    <div className="space-y-6">
      <BrandKitBackLink slug={slug} />
      <PageHeader
        eyebrow={t("brandKit.voiceEyebrow")}
        title={t("brandKit.voiceTitle")}
        description={t("brandKit.voiceDescription")}
      />
      <BrandKitHealth section="voice" slug={slug} count={rules.length} breakdown={breakdown} />

      <SectionCard
        id="voice"
        title={
          <>
            <MessageCircle className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            Voice rules
          </>
        }
        count={rules.length}
        fullWidth
        aria-label={t("brandKit.voiceAria")}
        data-testid="brand-kit-section-voice"
      >
        {canManage ? <VoiceForm slug={slug} /> : null}
        <VoiceRuleList slug={slug} canManage={canManage} rules={rules} t={t} />
      </SectionCard>
    </div>
  );
}
