import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { PageHeader } from "@/components/workspace/page-header";
import { BatchForm } from "./batch-form";
import { tForActive } from "@/lib/i18n/t-for-active";
import { listActiveChannelsForWorkspace } from "@/lib/channels/service";
import { listActiveCampaigns } from "@/lib/planning/campaigns";
import { listActivePillars } from "@/lib/planning/pillars";
import { listActiveTemplates } from "@/lib/planning/templates";
import { db } from "@/lib/db";
import { workspaceSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("batchAdd.title") };
}

export default async function BatchAddPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  if (
    !(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
      "workspace_manager",
      "content_planner",
    ]))
  )
    notFound();
  const { t } = await tForActive();
  const [channels, campaigns, pillars, templates, settingsRows] = await Promise.all([
    listActiveChannelsForWorkspace(workspace.id),
    listActiveCampaigns(workspace.id),
    listActivePillars(workspace.id),
    listActiveTemplates(workspace.id),
    db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspace.id))
      .limit(1),
  ]);
  const settings = settingsRows[0];
  return (
    <div
      className="mx-auto w-full max-w-[1600px] min-w-0 space-y-6"
      data-testid="workspace-planning-batch"
    >
      <PageHeader
        eyebrow={workspace.name}
        title={t("batchAdd.title")}
        description={
          <>
            {t("batchAdd.description")}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
        action={
          <Button variant="secondary" asChild>
            <Link href={`/app/w/${slug}/planning/monthly`}>{t("monthlyPlanning.openSession")}</Link>
          </Button>
        }
      />
      <BatchForm
        slug={slug}
        workspaceTimezone={workspace.timezone}
        channels={channels.map((channel) => ({
          id: channel.id,
          platform: channel.platform,
          accountName: channel.accountName,
        }))}
        campaigns={campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name }))}
        pillars={pillars.map((pillar) => ({ id: pillar.id, name: pillar.name }))}
        templates={templates.map((template) => ({
          id: template.id,
          name: template.name,
          format: template.format,
          briefTemplate: template.briefTemplate ?? "",
          defaultChannelIds: template.defaultChannelIds ?? [],
          formatPayload: template.formatPayload ?? { schemaVersion: 1 },
        }))}
        defaults={{
          contentOwnerId: session.user.id,
          ...(settings?.defaultDesignerId ? { defaultDesignerId: settings.defaultDesignerId } : {}),
        }}
        ownerOptions={[{ id: session.user.id, name: session.user.name ?? "You" }]}
      />
    </div>
  );
}
