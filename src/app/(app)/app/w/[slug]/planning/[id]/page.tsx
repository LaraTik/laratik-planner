import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getContentItem, listWorkspaceDesigners, UPDATEABLE_STATUSES } from "@/lib/content/service";
import { listApprovalsForItem, listDeliveryVersionsForItem } from "@/lib/deliveries/service";
import {
  listPublicationsForItem,
  evaluateReadiness,
  readAllChannelPayloads,
} from "@/lib/publishing";
import { listActivityEvents } from "@/lib/notifications/activity";
import { mapFormatPayloadToPlatform } from "@/lib/format-payload/mapper";
import { listCommentsForItem } from "@/lib/discussions/service";
import { getWorkspaceRoles, hasWorkspaceRole, isAgencyAdmin } from "@/lib/auth/policy";
// resolveActiveAgencyContext is intentionally NOT imported here. The
// page derives its agency scope from `ws.agencyId` (the workspace
// row's actual agency) rather than the user's active agency, so
// AI settings + locale always match the workspace the user is in,
// not whichever agency they switched to last. This is the
// anti-cross-tenant fix for the /app/w/[slug]/planning/[id] page.
import { currentActor } from "@/lib/auth/current-actor";
import { hasPlatformPermission } from "@/lib/auth/platform-access";
import { Button } from "@/components/ui/button";
import { PlanningHeader } from "@/components/planning/planning-header";
import { PlanningSection } from "@/components/planning/planning-section";
import { ChannelPublishingCard } from "@/components/planning/channel-publishing-card";
import { ActivityWithFilters } from "@/components/planning/activity-with-filters";
import { OverviewCommandCenter } from "@/components/planning/overview-command-center";
import { FormatPayloadEditor } from "@/components/forms/format-payload-editor";
// Phase 6 of the planning-detail refactor (2026-08-30): the
// inline title/date/brief editors used to live here. They
// moved into the Overview's `DetailsSection` (see
// `@/components/planning/overview-command-center`). The
// source component (`./inline-editable-fields`) is unchanged.
import { WorkflowRail, WorkflowSheet } from "@/components/planning/workflow-rail";
import { DeliverySection } from "./delivery-section";
import { AiAssistancePanel } from "@/components/planning/ai-assistance-panel";
import { getResetIdeaCounts, EMPTY_RESET_IDEA_COUNTS } from "@/lib/content/reset-idea";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { db } from "@/lib/db";
import { aiFeatureSettings, agencies, socialChannels, users } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { EditDetailsDrawer } from "@/components/planning/edit-details-drawer";
import { isAiEnabled } from "@/lib/ai";
import { AI_CAPABILITY_METADATA } from "@/lib/ai/capabilities";
import { parseFormatPayload } from "@/lib/format-payload/schemas";
import { WorkflowStepper } from "@/components/planning/workflow-stepper";
import { PlatformPreview } from "@/components/planning/platform-preview";
import { WorkspaceShell } from "./workspace-shell";
import { type WorkspaceTab } from "@/components/planning/workspace-tabs";
import { PublishPackageForm } from "./publish/publish-package-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  return { title: `Content · ${(await params).id.slice(0, 8)}` };
}

/**
 * Primary CTA copy for the Next-Action card in the Overview.
 * Mirrors the contextual button in the workspace header so the
 * two are never out of sync. The override hook (e.g. when the
 * server already determined a different primary action) is the
 * `primaryActionLabel` prop in `OverviewCommandCenter`.
 */
function nextActionLabel(status: string, canEdit: boolean): string {
  switch (status) {
    case "draft":
      return canEdit ? "Edit content" : "View content";
    case "content_review":
      return "Open content review";
    case "changes_requested":
      return "Review changes";
    case "approved_for_design":
    case "in_design":
    case "creative_review":
      return "Open Creative";
    case "ready_to_publish":
    case "partially_published":
      return "Open Publishing";
    case "blocked":
      return "Open workflow";
    case "published":
      return "View Publishing";
    default:
      return "View content";
  }
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
    activityEvents,
    readiness,
    channelPayloads,
    activeChannels,
    canConfirmReadiness,
    canApproveFinalCopy,
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
    // Phase 5 of the planning-detail refactor (2026-08-30):
    // the EditDetailsDrawer needs the same channel list as
    // the standalone `/edit/[id]` page. We union the active
    // workspace channels with the item's already-selected
    // channels so a stale channel can still be deselected
    // (mirrors `planning/edit/[id]/page.tsx`).
    db
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
      ),
    // Phase 7 of the planning-detail refactor (2026-08-30):
    // these two role checks were previously computed inside
    // the standalone `/publish` route. With the publish form
    // moving into the Publishing tab, the checks now live
    // here so the form can render with the right affordances.
    hasWorkspaceRole(actor, ws.id, ["workspace_manager", "content_planner", "publisher"]),
    isAgencyAdmin(actor, ws.agencyId),
  ]);

  const agencyId = ws.agencyId;
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

  // ── Comment-counts for the discussion trigger
  const openCommentsCount = discussionComments.filter((c) => !c.resolvedAt).length;
  const mentionCount = discussionComments.filter(
    (c) => c.currentUserMentioned && !c.resolvedAt,
  ).length;

  // ── Overview command-center inputs ─────────────────────────
  // The Overview tab is a "command center" — not a duplicate of
  // every section. It needs four compact signals:
  //   1. A one-line readiness per workspace area (Content /
  //      Creative / Publishing / Schedule). Each row is a
  //      deep-link to the section that resolves it.
  //   2. A compact content summary (format, channels, owner,
  //      planned publish).
  //   3. The last 3-5 meaningful activity events.
  //   4. A primary CTA based on the current workflow status.

  const finalApprovedCount = deliveries.filter((d) => d.isFinalApproved).length;
  const deliveryCount = deliveries.length;
  const configuredChannelCount = channelConfigs.filter((c) => c.configured).length;

  // Content readiness — derived from brief + required format fields.
  // The detailed readiness service already reports per-issue
  // blockers; we look at the highest-severity issue in the
  // "content.*" path to pick the headline status.
  const contentReadinessIssue = readiness.issues.find((i) =>
    i.path.toLowerCase().startsWith("content"),
  );
  const contentReadinessStatus: "ready" | "warning" | "danger" | "neutral" =
    contentReadinessIssue?.severity === "blocker"
      ? "danger"
      : contentReadinessIssue?.severity === "recommendation"
        ? "warning"
        : (item.brief ?? "").trim().length > 0
          ? "ready"
          : "warning";

  // Creative readiness — derived from delivery presence + approval.
  const creativeReadinessStatus: "ready" | "warning" | "danger" | "neutral" =
    finalApprovedCount > 0
      ? "ready"
      : deliveryCount > 0
        ? "warning"
        : item.status === "in_design" ||
            item.status === "creative_review" ||
            item.status === "changes_requested"
          ? "warning"
          : "neutral";

  // Publishing readiness — derived from per-channel config + blocker count.
  const publishingBlockers = readiness.issues.filter(
    (i) =>
      i.severity === "blocker" &&
      (i.path.toLowerCase().startsWith("publish") ||
        i.path.toLowerCase().startsWith("channel") ||
        i.path.toLowerCase().startsWith("disclosure")),
  ).length;
  const publishingReadinessStatus: "ready" | "warning" | "danger" | "neutral" =
    publishingBlockers > 0
      ? "danger"
      : item.channels.length === 0
        ? "neutral"
        : configuredChannelCount < item.channels.length
          ? "warning"
          : "ready";

  // Schedule readiness — past-dated or shipped. `nowMs` is the
  // server's request time, not a render-time impurity (this is a
  // Server Component, evaluated once per request).
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const plannedMs = item.plannedPublishAt.getTime();
  const shipped =
    item.status === "published" ||
    item.status === "partially_published" ||
    item.status === "cancelled";
  const scheduleReadinessStatus: "ready" | "warning" | "danger" | "neutral" = shipped
    ? "ready"
    : plannedMs < nowMs
      ? "warning"
      : "ready";

  const channelsNotConfigured = item.channels.length - configuredChannelCount;
  const overviewReadinessLines = [
    {
      id: "content",
      label: "Content",
      status: contentReadinessStatus,
      detail:
        contentReadinessStatus === "ready"
          ? "Brief and format fields are filled in"
          : (contentReadinessIssue?.message ?? "Brief is empty"),
      href: "#content",
    },
    {
      id: "assets-versions",
      label: "Assets & versions",
      status: creativeReadinessStatus,
      detail:
        creativeReadinessStatus === "ready"
          ? "An approved version is on file"
          : deliveryCount === 0
            ? "No design versions yet"
            : `${deliveryCount} version${deliveryCount === 1 ? "" : "s"}, none approved`,
      // Phase 3 of the planning-detail refactor (2026-08-30):
      // the "Creative" section merged into the Content tab as
      // "Assets & versions". The row now points at the new
      // anchor inside the Content panel.
      href: "#assets-versions",
    },
    {
      id: "publishing",
      label: "Publishing",
      status: publishingReadinessStatus,
      detail:
        publishingReadinessStatus === "ready"
          ? item.channels.length === 0
            ? "No channels"
            : "Channels configured"
          : publishingReadinessStatus === "danger"
            ? `${publishingBlockers} blocker${publishingBlockers === 1 ? "" : "s"}`
            : `${channelsNotConfigured} channel${channelsNotConfigured === 1 ? "" : "s"} need setup`,
      href: "#publishing",
    },
    {
      id: "schedule",
      label: "Schedule",
      status: scheduleReadinessStatus,
      detail: shipped
        ? item.status === "cancelled"
          ? "Cancelled"
          : "Shipped"
        : plannedMs < nowMs
          ? "Planned date is in the past"
          : "On schedule",
      href: "#publishing",
    },
  ];

  // Recent activity: last 5 events. The full list is also
  // rendered under the Activity tab. We don't filter by kind
  // here — the user wants to see what just happened at a
  // glance, regardless of category.
  const recentActivity = activityEvents.slice(0, 5);

  const primaryActionLabel = nextActionLabel(item.status, canEdit);
  // Phase 3 of the planning-detail refactor (2026-08-30): the
  // "Creative" section merged into the Content tab as "Assets
  // & versions". The Next-Action CTA on Overview now scrolls
  // to the new anchor.
  const reviewChangesHref = `#assets-versions`;

  // ── Primary action — exactly ONE "Edit content" entrypoint.
  // Phase 5 of the planning-detail refactor (2026-08-30) replaced
  // the previous `<Link>` to `/edit/[id]` with an
  // `EditDetailsDrawer` so routine edits stay on the planning
  // detail page. The standalone route is preserved as a deep-
  // link fallback (the drawer has an "Open full editor" link to
  // it). The `editHref` is still passed to the Overview's "Edit
  // details" readiness row, which is left as a deep-link for
  // now (will become a drawer open callback in phase 6).
  const editHref = `/app/w/${slug}/planning/edit/${item.id}`;

  // Channel list for the drawer's picker. Union the active
  // channels with the item's already-selected channels so a
  // stale channel can still be deselected (mirrors the
  // standalone edit page).
  const seenChannelIds = new Set(activeChannels.map((c) => c.id));
  const missingSelected = item.channels
    .filter((c) => !seenChannelIds.has(c.socialChannelId))
    .map((c) => ({
      id: c.socialChannelId,
      accountName: c.accountName,
      platform: c.platform,
    }));
  const editChannels = [...activeChannels, ...missingSelected];

  const primaryAction = canEdit ? (
    <EditDetailsDrawer
      workspaceSlug={slug}
      contentItemId={item.id}
      channels={editChannels}
      initial={{
        title: item.title,
        format: item.format as
          | "static_post"
          | "carousel"
          | "story"
          | "short_form_video"
          | "long_form_video"
          | "live_content"
          | "article"
          | "other",
        brief: item.brief,
        plannedPublishAtIso: item.plannedPublishAt.toISOString(),
        channelIds: item.channels.map((c) => c.socialChannelId),
      }}
    />
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

      {/* Workflow — Phase 4 of the planning-detail refactor
          (2026-08-30) split this into two responsive variants:
            - Desktop (`lg+`): `WorkflowRail` — right-side column
              with collapse/expand + localStorage persistence.
            - Mobile (`<lg`): `WorkflowSheet` — a compact trigger
              pill under the header that opens a bottom sheet.
          The legacy top-of-page `WorkflowBar` (the original
          implementation) was deleted in the dead-code cleanup
          pass; its action button tree + approval timeline
          now live inside `WorkflowRail`. The `workflow` anchor
          is preserved for legacy hash deep links from the
          planning list. */}
      <div className="space-y-3">
        <div className="lg:hidden">
          <WorkflowSheet
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
        </div>
        <div id="workflow" className="hidden scroll-mt-24 lg:block">
          <WorkflowRail
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
        </div>
      </div>

      {/* Tabbed workspace + drawer + overflow menu. Phase 1 of the
          planning-detail refactor (2026-08-30) replaced the previous
          scroll-spy `children` pattern with a `panels` record keyed
          by `WorkspaceTabId`. The shell now renders only the active
          panel — off-tab content unmounts. The 5 in-page sections
          (overview, content, creative, publishing, activity) become
          4 panels; the Creative section moves inside the Content
          panel for now (its `id="creative"` survives so the
          Overview's Creative readiness row still scrolls to it).
          Phase 3 retires the Creative section's testID. */}
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
        panels={{
          overview: (
            <section
              id="overview"
              className="scroll-mt-24"
              data-testid="workspace-tab-panel-overview"
            >
              <OverviewCommandCenter
                workspaceSlug={slug}
                contentItemId={item.id}
                contentStatus={item.status}
                title={item.title}
                brief={item.brief ?? ""}
                format={item.format}
                plannedPublishAt={item.plannedPublishAt.toLocaleString()}
                workspaceTimezone={ws.timezone}
                channels={item.channels.map((ch) => {
                  const cfg = channelConfigs.find((c) => c.id === ch.id);
                  return {
                    id: ch.id,
                    platform: ch.platform,
                    accountName: ch.accountName,
                    configured: cfg?.configured ?? false,
                  };
                })}
                ownerName={owner?.displayName ?? null}
                readinessBlockers={readiness.blockers}
                readinessCanPublish={readiness.canPublish}
                readiness={overviewReadinessLines}
                deliveryCount={deliveryCount}
                finalApprovedCount={finalApprovedCount}
                recentActivity={recentActivity}
                totalActivityCount={activityEvents.length}
                canEdit={canEdit}
                editHref={editHref}
                primaryActionLabel={primaryActionLabel}
                reviewChangesHref={reviewChangesHref}
              />
            </section>
          ),
          content: (
            <section
              id="content"
              className="mt-6 scroll-mt-24 space-y-6"
              data-testid="workspace-tab-panel-content"
            >
              {/* Phase 6 of the planning-detail refactor (2026-08-30):
                  the "Basic information" block (title, brief, planned
                  publish) was moved into the Overview's `DetailsSection`,
                  where the same inline editors are mounted. The Content
                  tab now opens directly with the creative brief + live
                  preview, which is the working surface the planner /
                  editor actually came for. */}

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
                  <p className="text-label text-fg-secondary font-semibold uppercase">
                    AI assistance
                  </p>
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

              {/* Assets & Versions — designer submissions, version
                  history, and feedback. Phase 3 of the planning-
                  detail refactor (2026-08-30) merged the orphan
                  "Creative" tab into the Content panel and
                  renamed the user-facing copy from "Delivery" →
                  "Assets & Versions" per spec §10 + §16. The
                  technical model (`delivery_versions`) is
                  unchanged; only the visible label and anchor
                  moved. */}
              <section
                id="assets-versions"
                className="scroll-mt-24 space-y-4"
                data-testid="content-assets-versions"
              >
                <PlanningSection
                  id="delivery"
                  title="Assets & versions"
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
            </section>
          ),
          publishing: (
            <section
              id="publishing"
              className="mt-6 scroll-mt-24 space-y-4"
              data-testid="workspace-tab-panel-publishing"
            >
              {/*
                Phase 7 of the planning-detail refactor (2026-08-30)
                absorbed the standalone `/publish` route into the
                Publishing tab. The `ChannelPublishingCard` list
                stays for the per-channel "Record outcome" affordance
                (still useful for managers / publishers who just
                want to record a published URL without opening the
                full form). The full `PublishPackageForm` is mounted
                below it for users who want to edit the package.

                The previous "Open publishing setup" deep-link is
                gone — the form is in front of the user. The
                `/publish` route still exists as a server-side
                redirect (see `publish/page.tsx`).
              */}
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
                      />
                    );
                  })}
                </div>
              )}

              {item.channels.length > 0 ? (
                <div className="mt-4" data-testid="publish-package-form-mount">
                  <PublishPackageForm
                    workspaceId={ws.id}
                    workspaceSlug={slug}
                    contentItemId={item.id}
                    itemTitle={item.title}
                    itemFormat={item.format}
                    formatPayloadPreFill={mapFormatPayloadToPlatform({
                      format: item.format,
                      formatPayload: (item as { formatPayload?: unknown }).formatPayload,
                    })}
                    channels={item.channels.map((c) => ({
                      id: c.id,
                      socialChannelId: c.socialChannelId,
                      platform: c.platform,
                      accountName: c.accountName,
                      // The strict `PlatformPayload` discriminated
                      // union comes from the publish-package form.
                      // The lookup is widened through
                      // `Record<string, unknown>` because the
                      // `readAllChannelPayloads` return type
                      // tracks the per-platform schema; the form
                      // itself handles the validation on save.
                      payload: ((channelPayloads as Record<string, unknown>)[c.socialChannelId] ??
                        null) as never,
                    }))}
                    deliveryVersions={deliveries.map((d) => ({
                      id: d.id,
                      versionNumber: d.versionNumber,
                      isFinalApproved: d.isFinalApproved,
                    }))}
                    readiness={readiness}
                    canEdit={canEdit}
                    canApproveFinalCopy={canApproveFinalCopy}
                    canConfirmReadiness={canConfirmReadiness}
                  />
                </div>
              ) : null}
            </section>
          ),
          activity: (
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
          ),
        }}
        canResetIdea={canResetIdea}
        resetCounts={resetCounts}
        activityCount={activityEvents.length}
        openCommentCount={openCommentsCount}
        mentionCount={mentionCount}
      />

      {/* Audit row — meta info that doesn't fit anywhere else */}
      <p className="text-label text-fg-muted text-center">
        Last updated {item.updatedAt.toLocaleString()} · Revision {readiness.revision}
      </p>
    </div>
  );
}
