import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil, ArrowLeft, ExternalLink, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getContentItem, listWorkspaceDesigners, UPDATEABLE_STATUSES } from "@/lib/content/service";
import { listApprovalsForItem, listDeliveryVersionsForItem } from "@/lib/deliveries/service";
import { listPublicationsForItem, evaluateReadiness } from "@/lib/publishing";
import { presentReadinessIssues } from "@/lib/publishing/readiness-presentation";
import { listCommentsForItem } from "@/lib/discussions/service";
import { getWorkspaceRoles } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { hasPlatformPermission } from "@/lib/auth/platform-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlanningHeader } from "@/components/planning/planning-header";
import { PlanningSection } from "@/components/planning/planning-section";
import { ReadinessPanel } from "@/components/planning/readiness-panel";
import { ChannelPublishingCard } from "@/components/planning/channel-publishing-card";
import { ActivityWithFilters } from "@/components/planning/activity-with-filters";
import { FormatPayloadEditor } from "@/components/forms/format-payload-editor";
import { InlineBriefEditor, InlineDateEditor, InlineTitleEditor } from "./inline-editable-fields";
import { WorkflowBar } from "./workflow-bar";
import { DeliverySection } from "./delivery-section";
import { AiAssistancePanel } from "@/components/planning/ai-assistance-panel";
import { getResetIdeaCounts, EMPTY_RESET_IDEA_COUNTS } from "@/lib/content/reset-idea";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { db } from "@/lib/db";
import { aiFeatureSettings, agencies, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isAiEnabled } from "@/lib/ai";
import { AI_CAPABILITY_METADATA } from "@/lib/ai/capabilities";
import { parseFormatPayload } from "@/lib/format-payload/schemas";
import { listActivityEvents } from "@/lib/notifications/activity";
import { readAllChannelPayloads } from "@/lib/publishing";
import { WorkflowStepper } from "@/components/planning/workflow-stepper";
import { PlatformPreview } from "@/components/planning/platform-preview";
import { WorkspaceShell } from "./workspace-shell";
import { type WorkspaceTab } from "@/components/planning/workspace-tabs";

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

  const roles = await getWorkspaceRoles(actor, ws.id);
  const actorRoles = {
    isManager: roles.has("workspace_manager"),
    isPlanner: roles.has("content_planner"),
    isDesigner: roles.has("designer"),
    isInternalReviewer: roles.has("internal_reviewer"),
    isClientReviewer: roles.has("client_reviewer"),
    isPublisher: roles.has("publisher"),
  };

  const [
    approvals,
    publications,
    discussionComments,
    deliveries,
    designers,
    canResetIdea,
    resetCounts,
    agencyContext,
    activityEvents,
    readiness,
    channelPayloads,
  ] = await Promise.all([
    listApprovalsForItem(actor, id),
    listPublicationsForItem(actor, id).catch(() => []),
    listCommentsForItem(actor, id).catch(() => []),
    listDeliveryVersionsForItem(actor, id, {
      isClientReviewer: actorRoles.isClientReviewer,
    }).catch(() => []),
    listWorkspaceDesigners(actor, ws.id).catch(() => []),
    hasPlatformPermission(actor, "platform.destructive.execute"),
    getResetIdeaCounts(id).catch(() => EMPTY_RESET_IDEA_COUNTS),
    resolveActiveAgencyContext({ actor }),
    listActivityEvents(actor, ws.id, id).catch(() => []),
    evaluateReadiness({ actor, workspaceId: ws.id, contentItemId: id }).catch(() => ({
      contentItemId: id,
      revision: 0,
      blockers: 0,
      recommendations: 0,
      requiredTotal: 0,
      requiredCompleted: 0,
      canPublish: false,
      issues: [],
      channels: [],
    })),
    readAllChannelPayloads({ actor, workspaceId: ws.id, contentItemId: id }).catch(() => ({})),
  ]);

  const agencyId = agencyContext?.agencyId ?? null;
  const aiLive = isAiEnabled();
  const [feature] = agencyId
    ? await db
        .select()
        .from(aiFeatureSettings)
        .where(eq(aiFeatureSettings.agencyId, agencyId))
        .limit(1)
    : [];
  const [agencyRow] = agencyId
    ? await db
        .select({ locale: agencies.locale })
        .from(agencies)
        .where(eq(agencies.id, agencyId))
        .limit(1)
    : [];
  const activeLocale = agencyRow?.locale ?? "en";
  const captionDraftsEnabled = Boolean(
    feature?.enabled &&
    (feature.enabledCapabilities.length === 0 ||
      feature.enabledCapabilities.includes("caption_drafts")),
  );
  const enabledCapabilities: string[] =
    feature?.enabledCapabilities && feature.enabledCapabilities.length > 0
      ? feature.enabledCapabilities
      : AI_CAPABILITY_METADATA.map((c) => c.id);
  const agencyEnabled = feature?.enabled ?? true;
  const hasKey = aiLive || feature?.keySource === "managed_secret";

  const [ownerRow] = item.contentOwnerId
    ? await db
        .select({ id: users.id, displayName: users.displayName, name: users.name })
        .from(users)
        .where(eq(users.id, item.contentOwnerId))
        .limit(1)
    : [];
  const owner = ownerRow
    ? {
        id: ownerRow.id,
        displayName: ownerRow.displayName ?? ownerRow.name ?? ownerRow.id.slice(0, 8),
      }
    : null;

  const canEdit =
    (actorRoles.isManager || actorRoles.isPlanner) &&
    UPDATEABLE_STATUSES.includes(item.status as (typeof UPDATEABLE_STATUSES)[number]);
  const canPostInternal =
    actorRoles.isManager ||
    actorRoles.isPlanner ||
    actorRoles.isDesigner ||
    actorRoles.isInternalReviewer ||
    actorRoles.isPublisher;
  const canPostClientVisible =
    actorRoles.isClientReviewer ||
    actorRoles.isManager ||
    actorRoles.isPlanner ||
    actorRoles.isDesigner ||
    actorRoles.isInternalReviewer ||
    actorRoles.isPublisher;

  const channelConfigs = item.channels.map((ch) => {
    const payload = (channelPayloads as Record<string, unknown>)[ch.socialChannelId];
    const configured = Boolean(
      payload &&
      typeof payload === "object" &&
      "selectedDestinationProfile" in payload &&
      payload.selectedDestinationProfile,
    );
    return {
      id: ch.id,
      platform: ch.platform,
      accountName: ch.accountName,
      configured,
    };
  });

  const publicationByChannel = new Map<string, (typeof publications)[number]>();
  for (const p of publications) {
    if (p.publication_record) {
      publicationByChannel.set(p.publication_record.contentItemChannelId, p);
    }
  }

  const presentationIssues = presentReadinessIssues(readiness.issues);

  // ── Comment-counts for the discussion trigger
  const openCommentsCount = discussionComments.filter((c) => !c.resolvedAt).length;
  const mentionCount = discussionComments.filter(
    (c) => c.currentUserMentioned && !c.resolvedAt,
  ).length;

  // ── Primary action — exactly ONE "Edit content" entrypoint.
  // The previous design had three identical buttons (Edit / Edit
  // all fields / Open full editor) all routing to the same URL.
  // See planning/[id]/edit-button.tsx for the rationale.
  const editHref = `/app/w/${slug}/planning/edit/${item.id}`;
  const primaryAction = canEdit ? (
    <Button asChild size="sm">
      <Link href={editHref} data-testid="open-full-edit" data-testid-edit-content="true">
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Edit content
      </Link>
    </Button>
  ) : (
    <Button variant="ghost" asChild>
      <Link href={`/app/w/${slug}/planning`} data-testid="planning-back-link">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to planning
      </Link>
    </Button>
  );

  // ── Workspace tabs — order matters; counts feed the badges.
  // The icon for each tab is resolved inside the Client
  // `WorkspaceTabs` component via `WORKSPACE_TAB_ICONS[id]`,
  // because React component functions are not serialisable
  // across the RSC boundary. The server only sends the
  // serialisable parts: id, label, count.
  const tabs: WorkspaceTab[] = [
    { id: "overview", label: "Overview" },
    { id: "content", label: "Content" },
    {
      id: "publishing",
      label: "Publishing",
      ...(readiness.blockers > 0 ? { count: readiness.blockers } : {}),
    },
    {
      id: "activity",
      label: "Activity",
      count: activityEvents.length,
    },
  ];

  return (
    <div className="space-y-6" data-testid="workspace-content-detail">
      {/* Compact header — answers the four questions at a glance */}
      <PlanningHeader
        workspaceSlug={slug}
        workspaceName={ws.name}
        workspaceTimezone={ws.timezone}
        contentItemId={item.id}
        title={item.title}
        format={item.format}
        status={item.status}
        channels={item.channels.map((ch) => ({
          platform: ch.platform,
          accountName: ch.accountName,
        }))}
        plannedPublishAt={item.plannedPublishAt.toLocaleString()}
        owner={owner}
        primaryAction={primaryAction}
        meta={<WorkflowStepper status={item.status} size="compact" />}
      />

      {/* Workflow — compact stepper + plain-language explanation + primary action */}
      <section id="workflow" className="scroll-mt-24">
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
      </section>

      {/* Readiness — only shown when there are blockers / recommendations.
          Now points to the publishing section in the same page. */}
      {readiness.blockers > 0 || readiness.recommendations > 0 ? (
        <ReadinessPanel
          ready={readiness.canPublish}
          blockers={readiness.blockers}
          recommendations={readiness.recommendations}
          issues={presentationIssues}
        />
      ) : null}

      {/* Tabbed workspace + drawer + overflow menu. The shell
          renders nothing itself — it wraps the four section
          groups below. */}
      <WorkspaceShell
        workspaceSlug={slug}
        contentItemId={item.id}
        ideaTitle={item.title}
        comments={discussionComments.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
          editedAt: c.editedAt ? c.editedAt.toISOString() : null,
          resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
        }))}
        currentUserId={actor.id}
        roles={actorRoles}
        canPostInternal={canPostInternal}
        canPostClientVisible={canPostClientVisible}
        tabs={tabs}
        canResetIdea={canResetIdea}
        resetCounts={resetCounts}
        activityCount={activityEvents.length}
        openCommentCount={openCommentsCount}
        mentionCount={mentionCount}
      >
        {/* ─── OVERVIEW ──────────────────────────────────────── */}
        <section
          id="overview"
          className="scroll-mt-24 space-y-4"
          data-testid="workspace-tab-panel-overview"
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <PlanningSection
              id="brief"
              title="Brief"
              description={
                canEdit
                  ? "Click the pencil to edit in place."
                  : "The brief that was approved. Changes require a fresh review."
              }
            >
              {canEdit ? (
                <InlineBriefEditor
                  workspaceSlug={slug}
                  contentItemId={item.id}
                  value={item.brief ?? ""}
                />
              ) : item.brief ? (
                <p className="text-body text-fg-primary whitespace-pre-wrap">{item.brief}</p>
              ) : (
                <p className="text-body text-fg-muted">No brief yet.</p>
              )}
            </PlanningSection>
            <PlanningSection
              id="schedule"
              title="Schedule"
              description={`Stored as ${ws.timezone}.`}
            >
              <div className="space-y-3">
                <div>
                  <p className="text-label text-fg-secondary font-semibold uppercase">Title</p>
                  {canEdit ? (
                    <InlineTitleEditor
                      workspaceSlug={slug}
                      contentItemId={item.id}
                      value={item.title}
                    />
                  ) : (
                    <p className="text-body text-fg-primary font-semibold">{item.title}</p>
                  )}
                </div>
                <div>
                  <p className="text-label text-fg-secondary font-semibold uppercase">
                    Planned publish
                  </p>
                  {canEdit ? (
                    <InlineDateEditor
                      workspaceSlug={slug}
                      contentItemId={item.id}
                      value={item.plannedPublishAt.toISOString()}
                      timezone={ws.timezone}
                    />
                  ) : (
                    <p className="text-body text-fg-primary">
                      {item.plannedPublishAt.toLocaleString()}{" "}
                      <span className="text-label text-fg-muted">· {ws.timezone}</span>
                    </p>
                  )}
                </div>
              </div>
            </PlanningSection>
            <PlanningSection
              id="channels"
              title="Channels"
              description={
                item.channels.length === 0
                  ? "Add at least one social channel to publish this item to."
                  : `${item.channels.length} channel${item.channels.length === 1 ? "" : "s"} selected.`
              }
            >
              {item.channels.length === 0 ? (
                <p className="text-body text-fg-muted">No channels selected yet.</p>
              ) : (
                <ul className="space-y-2" data-testid="planning-channels-list">
                  {item.channels.map((ch) => {
                    const cfg = channelConfigs.find((c) => c.id === ch.id);
                    return (
                      <li
                        key={ch.id}
                        className="border-border bg-surface-subtle flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border p-3"
                        data-testid={`planning-channel-${ch.id}`}
                      >
                        <Badge variant="outline">{ch.platform}</Badge>
                        <span className="text-body text-fg-primary font-semibold">
                          {ch.accountName}
                        </span>
                        {ch.plannedPublishAtOverride ? (
                          <span className="text-label text-fg-muted">
                            · override{" "}
                            {ch.plannedPublishAtOverride instanceof Date
                              ? ch.plannedPublishAtOverride.toLocaleString()
                              : new Date(ch.plannedPublishAtOverride).toLocaleString()}
                          </span>
                        ) : null}
                        {cfg?.configured ? (
                          <Badge variant="success" className="ml-auto">
                            Configured
                          </Badge>
                        ) : (
                          <Badge variant="warning" className="ml-auto">
                            In setup
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </PlanningSection>
          </div>
        </section>

        {/* ─── CONTENT ──────────────────────────────────────── */}
        <section
          id="content"
          className="mt-6 scroll-mt-24 space-y-4"
          data-testid="workspace-tab-panel-content"
        >
          {/* Live preview + per-channel structure for the content tab */}
          {item.channels.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(0,360px)]">
              <PlanningSection
                id="creative"
                title="Creative brief"
                description="The per-format fields (caption, hook, scenes, …). AI suggestions are inline per field."
              >
                <FormatPayloadEditor
                  workspaceSlug={slug}
                  contentItemId={item.id}
                  format={item.format}
                  initial={(() => {
                    try {
                      return parseFormatPayload(
                        item.format,
                        (item as { formatPayload?: unknown }).formatPayload,
                      ) as Record<string, unknown>;
                    } catch {
                      return { schemaVersion: 1 };
                    }
                  })()}
                  editable={canEdit}
                  locale={activeLocale}
                  aiEnabled={aiLive && captionDraftsEnabled}
                />
              </PlanningSection>
              <div className="space-y-3">
                <h3 className="text-title-card text-fg-primary font-semibold">Live preview</h3>
                {item.channels[0] ? (
                  <PlatformPreview
                    platform={item.channels[0].platform}
                    accountName={item.channels[0].accountName}
                    caption={
                      (
                        parseFormatPayload(
                          item.format,
                          (item as { formatPayload?: unknown }).formatPayload,
                        ) as { caption?: string }
                      ).caption ??
                      item.brief ??
                      ""
                    }
                    {...((
                      parseFormatPayload(
                        item.format,
                        (item as { formatPayload?: unknown }).formatPayload,
                      ) as { hashtags?: string[] }
                    ).hashtags
                      ? {
                          hashtags: (
                            parseFormatPayload(
                              item.format,
                              (item as { formatPayload?: unknown }).formatPayload,
                            ) as { hashtags?: string[] }
                          ).hashtags,
                        }
                      : {})}
                  />
                ) : null}
              </div>
            </div>
          ) : (
            <PlanningSection
              id="creative"
              title="Creative brief"
              description="The per-format fields (caption, hook, scenes, …). AI suggestions are inline per field."
            >
              <FormatPayloadEditor
                workspaceSlug={slug}
                contentItemId={item.id}
                format={item.format}
                initial={(() => {
                  try {
                    return parseFormatPayload(
                      item.format,
                      (item as { formatPayload?: unknown }).formatPayload,
                    ) as Record<string, unknown>;
                  } catch {
                    return { schemaVersion: 1 };
                  }
                })()}
                editable={canEdit}
                locale={activeLocale}
                aiEnabled={aiLive && captionDraftsEnabled}
              />
            </PlanningSection>
          )}

          {aiLive ? (
            <div
              className="flex flex-wrap items-center justify-between gap-2"
              data-testid="content-ai-section"
            >
              <p className="text-label text-fg-secondary font-semibold uppercase">AI assistance</p>
              <div className="flex items-center gap-2">
                {canEdit ? (
                  <AiAssistancePanel
                    workspaceSlug={slug}
                    contentItemId={item.id}
                    contentStatus={item.status}
                    isManager={actorRoles.isManager}
                    isPlanner={actorRoles.isPlanner}
                    enabledCapabilities={enabledCapabilities}
                    agencyEnabled={agencyEnabled}
                    hasKey={hasKey}
                    currentBrief={item.brief ?? ""}
                  />
                ) : null}
                {canEdit ? (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/app/w/${slug}/ai-settings`}>
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      AI settings
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        {/* ─── CREATIVE ──────────────────────────────────────── */}
        <section
          id="creative"
          className="mt-6 scroll-mt-24 space-y-4"
          data-testid="workspace-tab-panel-creative"
        >
          <PlanningSection
            id="delivery"
            title="Delivery"
            description="Design versions uploaded by the designer, plus the final-copy approval."
          >
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
          </PlanningSection>
        </section>

        {/* ─── PUBLISHING ──────────────────────────────────── */}
        <section
          id="publishing"
          className="mt-6 scroll-mt-24 space-y-4"
          data-testid="workspace-tab-panel-publishing"
        >
          <PlanningSection
            id="publishing-setup"
            title="Publishing setup"
            description="Per-channel publish configuration. Configure caption, disclosures, and approvals."
            actions={
              <Button size="sm" variant="outline" asChild>
                <Link
                  href={`/app/w/${slug}/planning/${item.id}/publish`}
                  data-testid="open-publish-package"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Open publishing setup
                </Link>
              </Button>
            }
          >
            {item.channels.length === 0 ? (
              <p className="text-body text-fg-muted">
                No channels selected. Add a channel first, then configure the publishing setup.
              </p>
            ) : (
              <div className="space-y-3" data-testid="publishing-cards">
                {item.channels.map((ch) => {
                  const cfg = channelConfigs.find((c) => c.id === ch.id);
                  const pub = publicationByChannel.get(ch.id);
                  return (
                    <ChannelPublishingCard
                      key={ch.id}
                      workspaceSlug={slug}
                      channel={{
                        id: ch.id,
                        platform: ch.platform,
                        accountName: ch.accountName,
                        configured: cfg?.configured ?? false,
                      }}
                      publication={pub ? { ...pub.publication_record } : null}
                      isPublisher={actorRoles.isPublisher || actorRoles.isManager}
                      publishPackageHref={`/app/w/${slug}/planning/${item.id}/publish#channel-${ch.id}`}
                    />
                  );
                })}
              </div>
            )}
          </PlanningSection>
        </section>

        {/* ─── ACTIVITY ─────────────────────────────────────── */}
        <section
          id="activity"
          className="mt-6 scroll-mt-24 space-y-4"
          data-testid="workspace-tab-panel-activity"
        >
          {/* Lifecycle events — only when there's at least one. The
              previous design always rendered an "Activity" card even
              when empty; that wasted vertical space. */}
          {activityEvents.length > 0 ? (
            <ActivityWithFilters events={activityEvents} />
          ) : (
            <PlanningSection
              id="activity-empty"
              title="Activity"
              description="Lifecycle events will appear here as the item moves through the workflow."
            >
              <p className="text-body text-fg-muted">
                No activity yet. Submit, comment, or upload a delivery to start the timeline.
              </p>
            </PlanningSection>
          )}
        </section>
      </WorkspaceShell>

      {/* Audit row — meta info that doesn't fit anywhere else */}
      <p className="text-label text-fg-muted text-center">
        Last updated {item.updatedAt.toLocaleString()} · Revision {readiness.revision}
      </p>
    </div>
  );
}
