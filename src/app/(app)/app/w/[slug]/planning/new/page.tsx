import { notFound, redirect } from "next/navigation";
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

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: `Quick Create · ${(await params).slug}` };
}

export default async function QuickCreatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const ws = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!ws) notFound();
  if (
    !(await hasWorkspaceRole({ id: session.user.id }, ws.id, [
      "workspace_manager",
      "content_planner",
    ]))
  ) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Creation access required"
          description="Only workspace managers and content planners can create ideas."
        />
        <Button asChild variant="ghost">
          <Link href={`/app/w/${slug}/planning`}>← Back to Planning</Link>
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
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Quick Create"
        description="Four fields, a draft is born. Edit anything later."
      />
      <QuickCreateForm workspaceSlug={slug} channels={channels} />
    </div>
  );
}
