import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getContentItem, listWorkspaceDesigners, UPDATEABLE_STATUSES } from "@/lib/content/service";
import { listApprovalsForItem, listDeliveryVersionsForItem } from "@/lib/deliveries/service";
import { listPublicationsForItem } from "@/lib/publishing/service";
import { listCommentsForItem } from "@/lib/discussions/service";
import { getWorkspaceRoles } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { statusBadgeVariant, humanStatus, humanFormat } from "@/lib/content/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { WorkflowBar } from "./workflow-bar";
import { DeliverySection } from "./delivery-section";
import { PublishingSection } from "./publishing-section";
import { DiscussionSection } from "./discussion-section";
import { AiAssistanceSection } from "./ai-assistance-section";
import { Button } from "@/components/ui/button";
import { EditIdeaButton } from "./edit-button";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { db } from "@/lib/db";
import { aiFeatureSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isAiEnabled } from "@/lib/ai";
import { AI_CAPABILITY_METADATA } from "@/lib/ai/capabilities";

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
  const actor = await currentActor();
  if (!actor) redirect("/signin");

  const ws = await getAccessibleWorkspace(actor, slug);
  if (!ws) notFound();

  const item = await getContentItem(actor, id);
  if (!item || item.workspaceId !== ws.id) notFound();

  // One DB round-trip for the full role set (cached per request via
  // React.cache). Replaces the historical 6× hasWorkspaceRole fan-out
  // (12-18 round-trips on the busiest page in the app).
  const roles = await getWorkspaceRoles(actor, ws.id);
  const actorRoles = {
    isManager: roles.has("workspace_manager"),
    isPlanner: roles.has("content_planner"),
    isDesigner: roles.has("designer"),
    isInternalReviewer: roles.has("internal_reviewer"),
    isClientReviewer: roles.has("client_reviewer"),
    isPublisher: roles.has("publisher"),
  };

  const [approvals, publications, discussionComments, deliveries, designers] = await Promise.all([
    listApprovalsForItem(actor, id),
    listPublicationsForItem(actor, id).catch(() => []),
    listCommentsForItem(actor, id).catch(() => []),
    listDeliveryVersionsForItem(actor, id, {
      isClientReviewer: actorRoles.isClientReviewer,
    }).catch(() => []),
    // FEAT-FULL-REVIEW-2026-08-26 — the assign-designer picker
    // dialog needs a roster. The query is role-gated to internal
    // workspace members; an empty list disables the trigger
    // gracefully (the manager invites via Settings or waits for a
    // designer to self-claim).
    listWorkspaceDesigners(actor, ws.id).catch(() => []),
  ]);

  // AI capability allowlist for the section on this page. Read the
  // agency feature row once; the section falls back to a "all on"
  // view when no row exists (default agency on) so the buttons
  // surface even before an admin saves settings.
  //
  // We pass a plain string[] (not a Set) to the client component.
  // `Set` is not in React's supported RSC serialisation surface, so
  // passing one across the server→client boundary throws "An error
  // occurred in the Server Components render" (minified to React
  // error #441) in production builds.
  const agencyId = (await resolveActiveAgencyContext({ actor }))?.agencyId ?? null;
  const aiLive = isAiEnabled();
  const [feature] = agencyId
    ? await db
        .select()
        .from(aiFeatureSettings)
        .where(eq(aiFeatureSettings.agencyId, agencyId))
        .limit(1)
    : [];
  // GAP-AI-UX-2026-08-26 — the planner surface used to assume three
  // capabilities were on; we now let the agency form be the single
  // source of truth and only default to "all on" when the row is
  // missing (the same behaviour the workspace status card uses).
  const enabledCapabilities: string[] =
    feature?.enabledCapabilities && feature.enabledCapabilities.length > 0
      ? feature.enabledCapabilities
      : AI_CAPABILITY_METADATA.map((c) => c.id);
  const agencyEnabled = feature?.enabled ?? true;
  const hasKey = aiLive || feature?.keySource === "managed_secret";

  return (
    <div className="space-y-6" data-testid="workspace-content-detail">
      <PageHeader
        eyebrow={ws.name}
        title={item.title}
        description={
          <>
            {humanFormat(item.format)} · {item.plannedPublishAt.toLocaleString()}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {ws.timezone}
            </span>
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusBadgeVariant(item.status)}>{humanStatus(item.status)}</Badge>
            {(actorRoles.isManager || actorRoles.isPlanner) &&
            UPDATEABLE_STATUSES.includes(item.status as (typeof UPDATEABLE_STATUSES)[number]) ? (
              <EditIdeaButton workspaceSlug={slug} contentItemId={item.id} />
            ) : null}
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/app/w/${slug}/planning`}>← Planning</Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardTitle className="mb-3">Brief</CardTitle>
        {item.brief ? (
          <p className="text-body text-fg-primary whitespace-pre-wrap">{item.brief}</p>
        ) : (
          <p className="text-body text-fg-muted">No brief yet.</p>
        )}
      </Card>

      <Card>
        <CardTitle className="mb-3">Channels</CardTitle>
        {item.channels.length === 0 ? (
          <p className="text-body text-fg-muted">No channels selected.</p>
        ) : (
          <ul className="space-y-2">
            {item.channels.map((ch) => (
              <li
                key={ch.id}
                className="text-body text-fg-primary flex flex-wrap items-center gap-2"
              >
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
      </Card>

      {aiLive ? (
        <AiAssistanceSection
          workspaceSlug={slug}
          contentItemId={item.id}
          contentStatus={item.status}
          isManager={actorRoles.isManager}
          isPlanner={actorRoles.isPlanner}
          enabledCapabilities={enabledCapabilities}
          agencyEnabled={agencyEnabled}
          hasKey={hasKey}
        />
      ) : null}

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
        designers={designers}
      />

      <DeliverySection
        workspaceSlug={slug}
        contentItemId={item.id}
        contentStatus={item.status}
        isDesigner={actorRoles.isDesigner}
        isManager={actorRoles.isManager}
        viewerIsClient={actorRoles.isClientReviewer}
        deliveries={deliveries.map((d) => ({
          id: d.id,
          versionNumber: d.versionNumber,
          description: d.description,
          designerNote: d.designerNote,
          submittedAt: d.submittedAt.toISOString(),
          isFinalApproved: d.isFinalApproved,
          submittedBy: d.submittedBy,
          links: d.links,
        }))}
      />

      <PublishingSection
        workspaceSlug={slug}
        contentItemId={item.id}
        channels={item.channels.map((ch) => ({
          id: ch.id,
          socialChannelId: ch.socialChannelId,
          accountName: ch.accountName,
          platform: ch.platform,
          plannedPublishAtOverride:
            ch.plannedPublishAtOverride instanceof Date
              ? ch.plannedPublishAtOverride.toISOString()
              : (ch.plannedPublishAtOverride ?? null),
        }))}
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
        currentUserId={actor.id}
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
