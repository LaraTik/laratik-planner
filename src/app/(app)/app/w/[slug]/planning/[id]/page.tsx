import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getContentItem } from "@/lib/content/service";
import { listApprovalsForItem } from "@/lib/deliveries/service";
import { listPublicationsForItem } from "@/lib/publishing/service";
import { listCommentsForItem } from "@/lib/discussions/service";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { statusBadgeVariant, humanStatus, humanFormat } from "@/lib/content/status";
import { Badge } from "@/components/ui/badge";
import { WorkflowBar } from "./workflow-bar";
import { DeliverySection } from "./delivery-section";
import { PublishingSection } from "./publishing-section";
import { DiscussionSection } from "./discussion-section";
import { Button } from "@/components/ui/button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  return { title: `Content · ${(await params).id.slice(0, 8)}` };
}

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
  if (!ws) notFound();

  const item = await getContentItem({ id: session.user.id }, id);
  if (!item || item.workspaceId !== ws.id) notFound();

  const [approvals, publications, discussionComments] = await Promise.all([
    listApprovalsForItem({ id: session.user.id }, id),
    listPublicationsForItem({ id: session.user.id }, id).catch(() => []),
    listCommentsForItem({ id: session.user.id }, id).catch(() => []),
  ]);

  const actorRoles = {
    isManager: await hasWorkspaceRole({ id: session.user.id }, ws.id, ["workspace_manager"]),
    isPlanner: await hasWorkspaceRole({ id: session.user.id }, ws.id, ["content_planner"]),
    isDesigner: await hasWorkspaceRole({ id: session.user.id }, ws.id, ["designer"]),
    isInternalReviewer: await hasWorkspaceRole({ id: session.user.id }, ws.id, [
      "internal_reviewer",
    ]),
    isClientReviewer: await hasWorkspaceRole({ id: session.user.id }, ws.id, ["client_reviewer"]),
    isPublisher: await hasWorkspaceRole({ id: session.user.id }, ws.id, ["publisher"]),
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label text-fg-muted">{ws.name}</p>
          <h1 className="text-title-page text-fg-primary font-semibold">{item.title}</h1>
          <p className="text-body text-fg-secondary mt-1">
            {humanFormat(item.format)} · {item.plannedPublishAt.toLocaleString()}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={statusBadgeVariant(item.status)}>{humanStatus(item.status)}</Badge>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/app/w/${slug}/planning`}>← Planning</Link>
          </Button>
        </div>
      </header>

      <section className="border-border bg-surface rounded-[var(--radius-card)] border p-5">
        <h2 className="text-title-card text-fg-primary mb-3 font-semibold">Brief</h2>
        {item.brief ? (
          <p className="text-body text-fg-primary whitespace-pre-wrap">{item.brief}</p>
        ) : (
          <p className="text-body text-fg-muted">No brief yet.</p>
        )}
      </section>

      <section className="border-border bg-surface rounded-[var(--radius-card)] border p-5">
        <h2 className="text-title-card text-fg-primary mb-3 font-semibold">Channels</h2>
        {item.channels.length === 0 ? (
          <p className="text-body text-fg-muted">No channels selected.</p>
        ) : (
          <ul className="space-y-2">
            {item.channels.map((ch) => (
              <li key={ch.id} className="text-body text-fg-primary flex items-center gap-2">
                <Badge variant="outline">{ch.platform}</Badge>
                <span>{ch.accountName}</span>
                {ch.plannedPublishAtOverride ? (
                  <span className="text-label text-fg-muted">
                    · override {ch.plannedPublishAtOverride.toLocaleString()}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <WorkflowBar
        workspaceSlug={slug}
        contentItemId={item.id}
        status={item.status}
        blockedReason={item.blockedReason}
        cancellationReason={item.cancellationReason}
        roles={actorRoles}
        approvals={approvals.map((a) => ({
          id: a.id,
          gate: a.gate,
          status: a.status,
          requestedAt: a.requestedAt.toISOString(),
          deliveryVersionId: a.deliveryVersionId,
        }))}
      />

      <DeliverySection
        workspaceSlug={slug}
        contentItemId={item.id}
        contentStatus={item.status}
        isDesigner={actorRoles.isDesigner}
        isManager={actorRoles.isManager}
      />

      <PublishingSection
        workspaceSlug={slug}
        contentItemId={item.id}
        channels={item.channels}
        publications={publications.map((p) => ({
          id: p.publication_record.id,
          contentItemChannelId: p.publication_record.contentItemChannelId,
          status: p.publication_record.status,
          publishedUrl: p.publication_record.publishedUrl,
          note: p.publication_record.note,
          failureReason: p.publication_record.failureReason,
        }))}
        isPublisher={actorRoles.isPublisher}
        isManager={actorRoles.isManager}
      />

      <DiscussionSection
        workspaceSlug={slug}
        contentItemId={item.id}
        comments={discussionComments.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
          editedAt: c.editedAt ? c.editedAt.toISOString() : null,
          resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
        }))}
        currentUserId={session.user.id}
        roles={actorRoles}
        canPostInternal={
          actorRoles.isManager ||
          actorRoles.isPlanner ||
          actorRoles.isDesigner ||
          actorRoles.isInternalReviewer ||
          actorRoles.isPublisher
        }
        canPostClientVisible={
          actorRoles.isClientReviewer ||
          actorRoles.isManager ||
          actorRoles.isPlanner ||
          actorRoles.isDesigner ||
          actorRoles.isInternalReviewer ||
          actorRoles.isPublisher
        }
      />
    </div>
  );
}
