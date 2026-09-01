import { notFound, redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { socialChannels } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/workspace/page-header";
import Link from "next/link";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { QuickCreateForm } from "./quick-create-form";
import { tForActive } from "@/lib/i18n/t-for-active";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: `Quick Create · ${(await params).slug}` };
}

export default async function QuickCreatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const ws = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!ws) notFound();
  const { t } = await tForActive();
  if (
    !(await hasWorkspaceRole({ id: session.user.id }, ws.id, [
      "workspace_manager",
      "content_planner",
    ]))
  ) {
    return (
      <div className="space-y-4">
        <PageHeader
          title={t("quickCreate.deniedTitle")}
          description={t("quickCreate.deniedDescription")}
        />
        <Button asChild variant="ghost">
          <Link href={`/app/w/${slug}/planning`}>{t("quickCreate.backToPlanning")}</Link>
        </Button>
      </div>
    );
  }

  const channels = await db
    .select({
      id: socialChannels.id,
      accountName: socialChannels.accountName,
      platform: socialChannels.platform,
    })
    .from(socialChannels)
    .where(
      and(
        eq(socialChannels.workspaceId, ws.id),
        eq(socialChannels.isActive, true),
        isNull(socialChannels.archivedAt),
      ),
    );

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="workspace-planning-new">
      <PageHeader
        title={t("quickCreate.title")}
        description={
          <>
            {t("quickCreate.description")}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {ws.timezone}
            </span>
          </>
        }
      />
      <QuickCreateForm workspaceSlug={slug} channels={channels} />
    </div>
  );
}
