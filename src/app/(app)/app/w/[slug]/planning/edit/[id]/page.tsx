import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { socialChannels } from "@/lib/db/schema";
import { getContentItem, UPDATEABLE_STATUSES } from "@/lib/content/service";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/workspace/page-header";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { humanStatus } from "@/lib/content/status";
import { EditIdeaForm } from "./edit-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  return { title: `Edit idea · ${(await params).id.slice(0, 8)}` };
}

/**
 * Edit a draft / changes-requested idea. The page mirrors the Quick
 * Create layout but pre-fills the existing values; the form posts to
 * `updateContentItemAction` which validates, applies, and redirects
 * back to the detail page.
 */
export default async function EditIdeaPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const ws = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!ws) notFound();

  const item = await getContentItem({ id: session.user.id }, id);
  if (!item || item.workspaceId !== ws.id) notFound();

  if (
    !(await hasWorkspaceRole({ id: session.user.id }, ws.id, [
      "workspace_manager",
      "content_planner",
    ]))
  ) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Edit access required"
          description="Only workspace managers and content planners can edit ideas."
        />
        <Button asChild variant="ghost">
          <Link href={`/app/w/${slug}/planning/${id}`}>← Back to idea</Link>
        </Button>
      </div>
    );
  }

  if (!UPDATEABLE_STATUSES.includes(item.status as (typeof UPDATEABLE_STATUSES)[number])) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="This idea can no longer be edited"
          description={`It is currently in ${humanStatus(item.status)} — once an idea moves past draft / changes requested, its title, format, schedule and channels are frozen so reviewers can rely on them.`}
        />
        <Button asChild variant="secondary">
          <Link href={`/app/w/${slug}/planning/${id}`}>← Back to idea</Link>
        </Button>
      </div>
    );
  }

  const allChannels = await db
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
    <div className="mx-auto max-w-2xl space-y-6" data-testid="workspace-planning-edit">
      <PageHeader
        eyebrow={ws.name}
        title="Edit idea"
        description={
          <>
            Make changes to a draft or changes-requested idea.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {ws.timezone}
            </span>
          </>
        }
      />
      <EditIdeaForm
        workspaceSlug={slug}
        contentItemId={item.id}
        channels={allChannels}
        initial={{
          title: item.title,
          format: item.format,
          brief: item.brief,
          plannedPublishAtIso: item.plannedPublishAt.toISOString(),
          channelIds: item.channels.map((c) => c.socialChannelId),
        }}
      />
    </div>
  );
}
