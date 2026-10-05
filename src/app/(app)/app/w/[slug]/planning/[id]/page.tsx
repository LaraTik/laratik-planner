import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Clock, Copy as CopyIcon, Eye, Sparkles } from "lucide-react";
import { TabSwitchLink } from "@/components/planning/tab-switch-link";
import { platformLabel } from "@/components/workspace/platform-icon";
import { tForActive } from "@/lib/i18n/t-for-active";
import { resolveContentLocale } from "@/lib/i18n/content-locale";
import { formatDate } from "@/lib/i18n/format-locale";

function humanPlatform(
  platform: string | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (!platform) return t("contentDetail.preview.noChannel");
  const key = `contentDetail.publishForm.platformLabels.${platform}`;
  const value = t(key);
  return value === key ? platformLabel(platform) : value;
}
import { auth } from "@/lib/auth/config";
import { getContentItem, listWorkspaceDesigners } from "@/lib/content/service";
import { listApprovalsForItem, listDeliveryVersionsForItem } from "@/lib/deliveries/service";

import {
  listPublicationsForItem,
  evaluateReadiness,
  readAllChannelPayloads,
  readAllChannelPayloadStates,
} from "@/lib/publishing";
import { listActivityEvents } from "@/lib/notifications/activity";
import { buildAudienceCopyViewModel } from "@/lib/format-payload/mapper";
import { listCommentsForItem } from "@/lib/discussions/service";
import { getSignedPreviewUrl } from "@/lib/media/thumbnails";
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
import { PublishingCommandCenter } from "@/components/planning/publishing-command-center";
import { ActivityWithFilters } from "@/components/planning/activity-with-filters";
import { OverviewNavigator } from "@/components/planning/overview-navigator";
import { FormatAwareContentEditor } from "@/components/forms/format-aware-content-editor";
import { ResearchTeardownApply } from "@/components/planning/research-teardown-apply";
import { MessagesPanel } from "@/components/planning/messages-panel";
// Phase 6 of the planning-detail refactor (2026-08-30): the
// inline title/date/brief editors used to live here. They
// moved into the Overview's `DetailsSection` (see
// `@/components/planning/overview-command-center`). The
// source component (`./inline-editable-fields`) is unchanged.
import { WorkflowSheet } from "@/components/planning/workflow-rail";
import { PlanningDetailShell } from "@/components/planning/planning-detail-shell";
import { DeliverySection } from "./delivery-section";
import { AiAssistancePanel } from "@/components/planning/ai-assistance-panel";
import { getResetIdeaCounts, EMPTY_RESET_IDEA_COUNTS } from "@/lib/content/reset-idea";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { db } from "@/lib/db";
import {
  aiFeatureSettings,
  agencies,
  contentResearchLinks,
  contentResearchTeardownLinks,
  researchTeardowns,
  socialChannels,
  socialPostObservations,
  trendBriefs,
  trendSignals,
  users,
  workspaceSettings as workspaceSettingsTable,
} from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getActiveApiKey } from "@/lib/ai";
import { parseFormatPayload, type ContentFormat } from "@/lib/format-payload/schemas";
import { PlatformPreviewSwitcher } from "@/components/planning/platform-preview-switcher";
import { type WorkspaceTab } from "@/components/planning/workspace-tabs";
import { PublishPackageForm } from "./publish/publish-package-form";
import { getMetaPublishingReadinessForWorkspace } from "@/lib/social/publishing-readiness-service";
import { metaPublishingReadinessCopy } from "@/lib/social/publishing-readiness-copy";
import { designerEditableFieldsFor } from "@/lib/content/production-fields";
import { AUDIENCE_COPY_KEYS } from "@/lib/content/audience-copy";
import { EditIdeaForm } from "../edit/[id]/edit-form";
import {
  ensurePlanningMediaFolderPathPublic,
  listMediaAssetsForContentItem,
  listMediaFolders,
} from "@/lib/media/service";
import { buildPlanningPresentation, type PlanningPresentation } from "@/lib/planning/presentation";
import type { WorkspaceRole, ApprovalGate } from "@/lib/content/workflow";
import { getActiveScenario } from "@/lib/content/workflow";
import type { ContentStatus } from "@/lib/content/status";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { id } = await params;
  const { t } = await tForActive();
  return { title: t("contentDetail.metaTitle", { id: id.slice(0, 8) }) };
}

export default async function ContentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams?: Promise<{ created?: string }>;
}) {
  const { t, code } = await tForActive();
  const { slug, id } = await params;
  const query = (await searchParams) ?? {};
  const justCreated = query.created === "1";
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");

  const ws = await getAccessibleWorkspace(actor, slug);
  if (!ws) notFound();

  // Load the workspace's workflow scenario so the rail / board / next-action
  // surface reflects the active spine. New column added by migration 0048;
  // unknown ids fall back to 'standard' inside getActiveScenario.
  const [workspaceSettingsRow] = await db
    .select({
      workflowScenario: workspaceSettingsTable.workflowScenario,
      approvalMode: workspaceSettingsTable.approvalMode,
    })
    .from(workspaceSettingsTable)
    .where(eq(workspaceSettingsTable.workspaceId, ws.id))
    .limit(1);
  const activeScenario = getActiveScenario({
    workflowScenario: workspaceSettingsRow?.workflowScenario ?? "standard",
    approvalMode: workspaceSettingsRow?.approvalMode ?? "simple",
  });

  const metaPublishingReadiness = await getMetaPublishingReadinessForWorkspace(ws.agencyId, ws.id);
  const metaPublishingCopy = metaPublishingReadinessCopy(metaPublishingReadiness, t);

  const item = await getContentItem(actor, id);
  if (!item || item.workspaceId !== ws.id) notFound();
  const activeWorkspaceChannels = await db
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
  const selectedChannelIds = new Set(item.channels.map((channel) => channel.socialChannelId));
  const planningChannels = [
    ...activeWorkspaceChannels,
    ...item.channels
      .filter(
        (channel) =>
          !activeWorkspaceChannels.some((candidate) => candidate.id === channel.socialChannelId),
      )
      .map((channel) => ({
        id: channel.socialChannelId,
        accountName: channel.accountName,
        platform: channel.platform,
      })),
  ];
  const [linkedTrend] = await db
    .select({ id: trendSignals.id, label: trendSignals.label })
    .from(trendBriefs)
    .innerJoin(trendSignals, eq(trendSignals.id, trendBriefs.signalId))
    .where(and(eq(trendBriefs.contentItemId, item.id), eq(trendBriefs.workspaceId, ws.id)))
    .limit(1);
  const researchLinks = await db
    .select({
      id: contentResearchLinks.id,
      permalink: socialPostObservations.permalink,
      mediaType: socialPostObservations.mediaType,
      views: socialPostObservations.views,
      likes: socialPostObservations.likes,
      comments: socialPostObservations.comments,
      accountName: socialChannels.accountName,
      platform: socialChannels.platform,
    })
    .from(contentResearchLinks)
    .innerJoin(
      socialPostObservations,
      eq(socialPostObservations.id, contentResearchLinks.socialPostObservationId),
    )
    .innerJoin(socialChannels, eq(socialChannels.id, socialPostObservations.socialChannelId))
    .where(
      and(
        eq(contentResearchLinks.contentItemId, item.id),
        eq(contentResearchLinks.workspaceId, ws.id),
      ),
    )
    .orderBy(desc(contentResearchLinks.createdAt));
  const [linkedTeardown] = await db
    .select({ teardownId: contentResearchTeardownLinks.researchTeardownId })
    .from(contentResearchTeardownLinks)
    .innerJoin(
      researchTeardowns,
      eq(researchTeardowns.id, contentResearchTeardownLinks.researchTeardownId),
    )
    .where(
      and(
        eq(contentResearchTeardownLinks.contentItemId, item.id),
        eq(contentResearchTeardownLinks.workspaceId, ws.id),
      ),
    )
    .orderBy(desc(contentResearchTeardownLinks.createdAt))
    .limit(1);

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
    channelPayloadStates,
    canConfirmReadiness,
    canApproveFinalCopy,
    linkedMediaAssets,
    mediaFolders,
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
    readAllChannelPayloadStates({ actor, workspaceId: ws.id, contentItemId: id }).catch(() => ({})),
    // Phase 7 of the planning-detail refactor (2026-08-30):
    // these two role checks were previously computed inside
    // the standalone `/publish` route. With the publish form
    // moving into the Publishing tab, the checks now live
    // here so the form can render with the right affordances.
    hasWorkspaceRole(actor, ws.id, ["workspace_manager", "content_planner", "publisher"]),
    isAgencyAdmin(actor, ws.agencyId),
    listMediaAssetsForContentItem(actor, {
      agencyId: ws.agencyId,
      workspaceId: ws.id,
      contentItemId: item.id,
    }).catch(() => []),
    listMediaFolders(actor, { agencyId: ws.agencyId, workspaceId: ws.id }).catch(() => []),
  ]);

  // PR 3 / Tier 3 (perf/media): sign a per-page R2 URL for the first
  // image asset's preview variant. The signed URL lets the planning
  // preview `<img>` download straight from the Cloudflare edge
  // instead of streaming through this Node process. We sign at the
  // top of the page (outside JSX) because the renderer is a sync
  // `.map()` and we can't `await` inside it.
  const firstImageAsset = linkedMediaAssets.find((row) => row.object.kind === "image");
  const firstImageSignedPreviewUrl = firstImageAsset
    ? await getSignedPreviewUrl(actor, firstImageAsset.asset.id)
    : null;

  // Resolve the canonical delivery folder (`Posts / {Format} / {YYYY} / {MM}`)
  // up front so the Delivery uploader can preselect it. Wrapped in .catch so a
  // misconfigured workspace (no actor, bad timezone, etc.) never 500s the
  // page — the picker falls back to "Unfiled" which the backend will
  // re-resolve on submit.
  const canonicalDeliveryFolderId = await ensurePlanningMediaFolderPathPublic({
    agencyId: ws.agencyId,
    workspaceId: ws.id,
    format: item.format,
    plannedPublishAt: item.plannedPublishAt,
    timezone: ws.timezone,
    createdBy: actor.id,
  }).catch(() => null);

  const agencyId = ws.agencyId;
  const [feature, activeApiKey] = await Promise.all([
    db
      .select()
      .from(aiFeatureSettings)
      .where(eq(aiFeatureSettings.agencyId, agencyId))
      .limit(1)
      .then((rows) => rows[0]),
    getActiveApiKey(agencyId),
  ]);
  const [agencyRow] = agencyId
    ? await db
        .select({ locale: agencies.locale })
        .from(agencies)
        .where(eq(agencies.id, agencyId))
        .limit(1)
    : [];
  const activeLocale = agencyRow?.locale ?? "en";
  const contentLocale = resolveContentLocale({
    formatPayload: (item as { formatPayload?: unknown }).formatPayload,
    fallback: activeLocale,
  });
  const captionDraftsEnabled = Boolean(
    feature?.enabled === true && feature.enabledCapabilities.includes("caption_drafts"),
  );
  const enabledCapabilities: string[] = feature?.enabledCapabilities ?? [];
  const agencyEnabled = feature?.enabled === true;
  const hasKey = Boolean(activeApiKey);
  const aiLive = agencyEnabled && hasKey;

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

  const visiblePendingApprovalGates = approvals
    .filter(
      (approval) =>
        approval.status === "pending" &&
        (!actorRoles.isClientReviewer || approval.gate === "creative_client"),
    )
    .map((approval) => approval.gate);

  const [designerRow] = item.designerId
    ? await db
        .select({ id: users.id, displayName: users.displayName, name: users.name })
        .from(users)
        .where(eq(users.id, item.designerId))
        .limit(1)
    : [];
  const designer = designerRow
    ? {
        id: designerRow.id,
        displayName: designerRow.displayName ?? designerRow.name ?? designerRow.id.slice(0, 8),
      }
    : null;

  const presentationRoles: WorkspaceRole[] = [
    ...(actorRoles.isManager ? (["workspace_manager"] as const) : []),
    ...(actorRoles.isPlanner ? (["content_planner"] as const) : []),
    ...(actorRoles.isDesigner ? (["designer"] as const) : []),
    ...(actorRoles.isInternalReviewer ? (["internal_reviewer"] as const) : []),
    ...(actorRoles.isClientReviewer ? (["client_reviewer"] as const) : []),
    ...(actorRoles.isPublisher ? (["publisher"] as const) : []),
  ];
  const publishingSetupReady = activityEvents.some((event) => {
    const metadata = event.metadata;
    const afterData = event.afterData;
    const revision =
      afterData !== null &&
      typeof afterData === "object" &&
      typeof (afterData as { revision?: unknown }).revision === "number"
        ? (afterData as { revision: number }).revision
        : null;
    return (
      metadata !== null &&
      typeof metadata === "object" &&
      (metadata as { resource?: unknown }).resource === "publish_readiness" &&
      (event as { summary?: string }).summary === "Publish package confirmed ready" &&
      (revision === null || revision === item.revision)
    );
  });
  const planningPresentation: PlanningPresentation = buildPlanningPresentation({
    status: item.status as ContentStatus,
    actorRoles: presentationRoles,
    blockedReason: item.blockedReason,
    cancellationReason: item.cancellationReason,
    readiness,
    publishingSetupReady,
    plannedPublishAt: item.plannedPublishAt,
    ...(owner ? { assignedOwner: { displayName: owner.displayName } } : {}),
    approvals: approvals.map((approval) => ({
      gate: approval.gate as ApprovalGate,
      status: approval.status as "pending" | "approved" | "changes_requested" | "cancelled",
      ...(approval.deliveryVersionId !== undefined
        ? { deliveryVersionId: approval.deliveryVersionId }
        : {}),
    })),
  });

  const canEditAll = (actorRoles.isManager || actorRoles.isPlanner) && item.status !== "cancelled";
  const canEditProduction =
    actorRoles.isDesigner && item.designerId === actor.id && item.status !== "cancelled";
  const canEdit = canEditAll || canEditProduction;
  // `savePlatformPayload` authorises workspace managers and content
  // planners only (`platform-payload-service.ts:110-120`). `canEdit`
  // additionally covers an assigned designer, who could therefore see
  // an enabled Save that always failed with FORBIDDEN. Keep the write
  // authority separate so the publish form can render a read-only
  // summary instead of a control the server will reject.
  const canSavePackage =
    (actorRoles.isManager || actorRoles.isPlanner) && item.status !== "cancelled";
  const editableFields =
    canEditProduction && !canEditAll ? designerEditableFieldsFor(item.format) : undefined;
  // Canonical copy remains editable by managers and planners after approval.
  const canEditCopy = (actorRoles.isManager || actorRoles.isPlanner) && item.status !== "cancelled";
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
  const approvedBeforeLaterEdits = item.channels.some((channel) => {
    const payload = (channelPayloads as Record<string, unknown>)[channel.socialChannelId];
    const approval =
      payload && typeof payload === "object" && "approval" in payload
        ? (payload as { approval?: { finalCopyApproved?: boolean } }).approval
        : undefined;
    const sourceRevision = (
      channelPayloadStates as Record<string, { copySourceRevision: number | null }>
    )[channel.socialChannelId]?.copySourceRevision;
    return (
      approval?.finalCopyApproved === true &&
      sourceRevision !== null &&
      sourceRevision !== undefined &&
      sourceRevision < item.revision
    );
  });

  const publicationByChannel = new Map<string, (typeof publications)[number]>();
  for (const p of publications) {
    if (p.publication_record) {
      publicationByChannel.set(p.publication_record.contentItemChannelId, p);
    }
  }
  // Once the publish package is confirmed, take the user directly to the
  // first channel that still needs an outcome. This removes a redundant
  // "open outcomes → choose a channel → open the form" sequence while
  // keeping the remaining channels available below it.
  /*
   * D5 — the outcomes section unlocks on setup readiness **or** on any
   * record of prior publication. Gating it on `publishingSetupReady`
   * alone would let a newer readiness flag hide a legacy item's
   * publication history, which is the one thing an operator can never
   * recreate. Every historical term stays an unlock trigger.
   */
  const outcomesUnlocked =
    publishingSetupReady ||
    publicationByChannel.size > 0 ||
    item.status === "partially_published" ||
    item.status === "published";

  const firstPendingOutcomeChannelId = publishingSetupReady
    ? (item.channels.find((channel) => !publicationByChannel.has(channel.id))?.id ?? null)
    : null;

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
  const publishingIsFuture = [
    "draft",
    "content_review",
    "changes_requested",
    "approved_for_design",
    "in_design",
    "creative_review",
  ].includes(item.status);
  // Publishing readiness is intentionally not presented as a current
  // blocker while an item is still being planned, reviewed, or designed.
  // The publishing surface remains available through its deep link, but
  // Overview should tell the user what they can do now.
  const overviewBlockers = planningPresentation.readiness.currentBlockers.length;
  const overviewReadinessLines = [
    {
      id: "content",
      label: t("contentDetail.readiness.rowContent"),
      status: contentReadinessStatus,
      detail:
        contentReadinessStatus === "ready"
          ? t("contentDetail.readiness.rowContentReady")
          : (contentReadinessIssue?.message ?? t("contentDetail.readiness.rowContentEmpty")),
      href: "#content",
    },
    {
      id: "assets-versions",
      label: t("contentDetail.readiness.rowAssets"),
      status: creativeReadinessStatus,
      detail:
        creativeReadinessStatus === "ready"
          ? t("contentDetail.readiness.rowAssetsReady")
          : deliveryCount === 0
            ? t("contentDetail.readiness.rowAssetsEmpty")
            : deliveryCount === 1
              ? t("contentDetail.readiness.rowAssetsUnapprovedOne", { count: deliveryCount })
              : t("contentDetail.readiness.rowAssetsUnapprovedMany", { count: deliveryCount }),
      // Phase 3 of the planning-detail refactor (2026-08-30):
      // the "Creative" section merged into the Content tab as
      // "Assets & versions". The row now points at the new
      // anchor inside the Content panel.
      href: "#assets-versions",
    },
    {
      id: "publishing",
      label: t("contentDetail.readiness.rowPublishing"),
      status: publishingIsFuture ? "neutral" : publishingReadinessStatus,
      detail: publishingIsFuture
        ? t("contentDetail.readiness.rowPublishingUpcoming")
        : publishingReadinessStatus === "ready"
          ? item.channels.length === 0
            ? t("contentDetail.readiness.rowPublishingNoChannels")
            : t("contentDetail.readiness.rowPublishingReady")
          : publishingReadinessStatus === "danger"
            ? publishingBlockers === 1
              ? t("contentDetail.readiness.rowPublishingBlockerOne", { count: publishingBlockers })
              : t("contentDetail.readiness.rowPublishingBlockerMany", { count: publishingBlockers })
            : channelsNotConfigured === 1
              ? t("contentDetail.readiness.rowPublishingNeedSetupOne", {
                  count: channelsNotConfigured,
                })
              : t("contentDetail.readiness.rowPublishingNeedSetupMany", {
                  count: channelsNotConfigured,
                }),
      href: "#publishing",
    },
    {
      id: "schedule",
      label: t("contentDetail.readiness.rowSchedule"),
      status: scheduleReadinessStatus,
      detail: shipped
        ? item.status === "cancelled"
          ? t("contentDetail.readiness.rowScheduleCancelled")
          : t("contentDetail.readiness.rowScheduleShipped")
        : plannedMs < nowMs
          ? t("contentDetail.readiness.rowScheduleOverdue")
          : t("contentDetail.readiness.rowScheduleOnTime"),
      href: "#publishing",
    },
  ];

  // Recent activity: last 5 events. The full list is also
  // rendered under the Activity tab. We don't filter by kind
  // here — the user wants to see what just happened at a
  // glance, regardless of category.
  const activityWithTarget = activityEvents.map((event) => ({
    ...event,
    targetLabel: item.title,
  }));
  const recentActivity = activityWithTarget.slice(0, 5);

  // The compact header is intentionally identity-only. Editing is
  // discoverable from the Overview details surface so it does not
  // compete with lifecycle ownership in the workflow rail.
  const editHref = `/app/w/${slug}/planning/edit/${item.id}`;

  // ── Workspace tabs — order matters; counts feed the badges.
  // The icon for each tab is resolved inside the Client
  // `WorkspaceTabs` component via `WORKSPACE_TAB_ICONS[id]`,
  // because React component functions are not serialisable
  // across the RSC boundary. The server only sends the
  // serialisable parts: id, label, count.
  //
  // `Preview` is the dedicated tab for the platform simulator.
  // It used to live in a sticky 360px right rail inside the
  // Content tab — that was the row's biggest UX smell because
  // it forced the editor + preview + workflow rail to compete
  // for width. Moving it to its own tab gives the Content tab
  // its editing width back and gives the preview room for
  // proper Feed / Reel / Story / Carousel surfaces in a later
  // pass (master prompt §7 + AGENTS.md §B + §C).
  const tabs: WorkspaceTab[] = [
    { id: "overview", label: t("contentDetail.tabs.overview") },
    { id: "create", label: t("contentDetail.tabs.create") },
    {
      id: "publish",
      label: t("contentDetail.tabs.publish"),
      ...(readiness.blockers > 0
        ? {
            count: readiness.blockers,
            countLabel: t("contentDetail.tabs.publishCount", { count: readiness.blockers }),
          }
        : {}),
    },
    {
      id: "activity",
      label: t("contentDetail.tabs.activity"),
      count: activityEvents.length,
      countLabel: t("contentDetail.tabs.activityCount", { count: activityEvents.length }),
    },
  ];

  // The publishing workspace keeps the simulator beside the channel
  // composer. The legacy preview panel remains mounted for saved links, so
  // this embedded instance uses its own id to avoid duplicate DOM anchors.
  // The publishing simulator's inputs, passed down as serializable data
  // so the Publish form can bind the preview to its own active-channel
  // state. It used to be a pre-rendered `PlanningSection` node, which
  // could not observe that state and therefore shipped a second,
  // competing channel switcher inside the preview.
  const publishPreviewData = (() => {
    if (item.channels.length === 0) return null;
    const copyView = buildAudienceCopyViewModel({
      format: item.format,
      formatPayload: (item as { formatPayload?: unknown }).formatPayload,
    });
    const thumbnailUrl = firstImageAsset
      ? (firstImageSignedPreviewUrl ??
        (firstImageAsset.object.previewStorageObjectId
          ? `/api/media/assets/${encodeURIComponent(firstImageAsset.asset.id)}/preview`
          : `/api/media/assets/${encodeURIComponent(firstImageAsset.asset.id)}`))
      : null;
    return {
      channels: item.channels.map((channel) => ({
        id: channel.id,
        socialChannelId: channel.socialChannelId,
        platform: channel.platform,
        accountName: channel.accountName,
        contentFormat: item.format,
        payload: (channelPayloads as Record<string, unknown>)[channel.socialChannelId] as {
          caption?: string;
          hashtags?: string[];
        } | null,
      })),
      sharedCaption: copyView.resolved.caption ?? item.brief ?? "",
      ...(copyView.resolved.hashtags ? { sharedHashtags: copyView.resolved.hashtags } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...(firstImageAsset?.object.width != null
        ? { thumbnailWidth: firstImageAsset.object.width }
        : {}),
      ...(firstImageAsset?.object.height != null
        ? { thumbnailHeight: firstImageAsset.object.height }
        : {}),
    };
  })();

  return (
    <div data-testid="workspace-content-detail">
      {justCreated ? (
        <div
          role="status"
          aria-live="polite"
          className="border-success/30 bg-success-container text-on-success-container mb-4 rounded-[var(--radius-control)] border px-3 py-3"
          data-testid="content-created-banner"
        >
          <p className="text-body font-semibold">{t("contentDetail.createdBanner.title")}</p>
          <p className="text-label mt-1">{t("contentDetail.createdBanner.description")}</p>
        </div>
      ) : null}
      {/* Three-zone application shell: header (top, spans the
          center column) + center workspace + sticky right rail.
          The `PlanningDetailShell` is a thin client wrapper that
          owns the grid layout, the right-rail collapse state, and
          the responsive breakpoint switches. The page itself
          stays a Server Component — only the shell is "use client". */}
      <PlanningDetailShell
        header={
          <>
            {/* Mobile-only workflow trigger. The page is a
                Server Component, so it can render the
                <WorkflowSheet> (a Radix Dialog) directly without
                a client boundary for the trigger itself. The
                sheet only appears on <lg viewports. */}
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
                {...(designer
                  ? { designer: { id: designer.id, label: designer.displayName } }
                  : {})}
                planningPresentation={planningPresentation}
              />
            </div>
            {/* Compact header — answers the four questions at a
                glance (back link, title, status, action). The
                workflow status stepper stays inside the header
                so the user can see the lifecycle at a glance
                even on the smallest viewport. */}
            <PlanningHeader
              workspaceSlug={slug}
              workspaceName={ws.name}
              workspaceTimezone={ws.timezone}
              contentItemId={item.id}
              title={item.title}
              backLabel={t("contentDetail.copy.backToPlanning")}
              format={item.format}
              formatLabel={t(`planningFilters.formatLabels.${item.format}`)}
              status={item.status}
              statusLabel={t(`planningFilters.statusLabels.${item.status}`)}
              channels={item.channels.map((ch) => ({
                platform: ch.platform,
                accountName: ch.accountName,
              }))}
              thumbnailUrl={firstImageSignedPreviewUrl}
              channelsSummary={
                item.channels.length === 0
                  ? t("contentDetail.overview.noChannels")
                  : item.channels.length === 1
                    ? item.channels[0]!.accountName
                    : t("contentDetail.overview.channelsCount", { count: item.channels.length })
              }
              plannedPublishAt={formatDate(item.plannedPublishAt, code, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: ws.timezone,
              })}
              plannedPublishAtIso={item.plannedPublishAt.toISOString()}
              canEdit={false}
              canTrash={false}
              editHref={editHref}
            />
          </>
        }
        workflow={{
          workspaceSlug: slug,
          contentItemId: item.id,
          status: item.status,
          blockedReason: item.blockedReason,
          cancellationReason: item.cancellationReason,
          roles: actorRoles,
          approvals: approvals.map((a) => ({
            id: a.id,
            gate: a.gate,
            status: a.status,
            requestedAt: a.requestedAt.toISOString(),
            deliveryVersionId: a.deliveryVersionId,
          })),
          designers,
          ...(designer ? { designer: { id: designer.id, label: designer.displayName } } : {}),
          planningPresentation,
          scenario: activeScenario,
        }}
        workspace={{
          workspaceSlug: slug,
          contentItemId: item.id,
          ideaTitle: item.title,
          editHref,
          canEdit: false,
          comments: discussionComments.map((c) => ({
            ...c,
            createdAt: c.createdAt.toISOString(),
            editedAt: c.editedAt ? c.editedAt.toISOString() : null,
            resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
          })),
          currentUserId: actor.id,
          roles: actorRoles,
          canPostInternal,
          canPostClientVisible,
          tabs,
          panels: {
            overview: (
              <section
                id="overview"
                className="scroll-mt-24"
                data-testid="workspace-tab-panel-overview"
              >
                <OverviewNavigator
                  workspaceSlug={slug}
                  contentItemId={item.id}
                  contentStatus={item.status}
                  title={item.title}
                  brief={item.brief ?? ""}
                  format={item.format}
                  plannedPublishAt={formatDate(item.plannedPublishAt, code, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: ws.timezone,
                  })}
                  plannedPublishAtIso={item.plannedPublishAt.toISOString()}
                  workspaceTimezone={ws.timezone}
                  channels={channelConfigs}
                  ownerName={owner?.displayName ?? null}
                  readinessBlockers={overviewBlockers}
                  readinessCanPublish={readiness.canPublish}
                  readiness={overviewReadinessLines}
                  attention={planningPresentation.attention}
                  deliveryCount={deliveryCount}
                  finalApprovedCount={finalApprovedCount}
                  references={researchLinks.flatMap((reference) =>
                    reference.permalink ? [reference.permalink] : [],
                  )}
                  recentActivity={recentActivity}
                  totalActivityCount={activityWithTarget.length}
                  canEdit={canEditAll}
                  canEditOverview={canEditAll}
                  editHref={editHref}
                  {...(planningPresentation.nextAction.ctaKey
                    ? { primaryActionLabel: t(planningPresentation.nextAction.ctaKey) }
                    : {})}
                  workflowStageLabel={t(planningPresentation.workflow.labelKey)}
                  nextActionHeadline={t(planningPresentation.nextAction.headlineKey)}
                  {...(planningPresentation.nextAction.descriptionKey
                    ? {
                        nextActionDescription: t(planningPresentation.nextAction.descriptionKey),
                      }
                    : {})}
                  {...(planningPresentation.nextAction.destinationTab
                    ? { nextActionDestinationTab: planningPresentation.nextAction.destinationTab }
                    : {})}
                  nextActionExecutable={planningPresentation.nextAction.executable}
                />
              </section>
            ),
            "create-basics": canEditAll ? (
              <section
                id="create-basics"
                className="scroll-mt-24 space-y-4"
                data-testid="workspace-create-basics"
              >
                <PlanningSection
                  id="create-plan"
                  title={t("contentDetail.overview.details")}
                  description={t("contentDetail.create.detailsDescription")}
                  collapsible
                >
                  <EditIdeaForm
                    workspaceSlug={slug}
                    contentItemId={item.id}
                    workspaceTimezone={ws.timezone}
                    channels={planningChannels}
                    mode="create"
                    initial={{
                      title: item.title,
                      format: item.format,
                      brief: item.brief ?? "",
                      plannedPublishAtIso: item.plannedPublishAt.toISOString(),
                      channelIds: [...selectedChannelIds],
                    }}
                  />
                </PlanningSection>
              </section>
            ) : null,
            content: (
              <section
                id="content"
                className="scroll-mt-24 space-y-6"
                data-testid="workspace-tab-panel-content"
              >
                {/* Phase 6 of the planning-detail refactor (2026-08-30):
                  the "Basic information" block (title, brief, planned
                  publish) was moved into the Overview's `DetailsSection`,
                  where the same inline editors are mounted. The Content
                  tab now opens directly with the creative brief — the
                  working surface the planner / editor actually came for.

                  Phase 7 (2026-08-31, /ui-ux-pro-max): the Live Preview
                  moved out of a sticky 360px right rail on this tab
                  and into a dedicated Preview tab. The editor now owns
                  the full content width. A compact "Open preview"
                  affordance + the platform label keep the preview
                  discoverable from the editing surface. */}

                {researchLinks.length > 0 ? (
                  <div
                    className="border-primary/30 bg-primary-subtle/30 text-fg-primary rounded-[var(--radius-control)] border p-4"
                    data-testid="content-research-reference"
                  >
                    <p className="text-body font-semibold">
                      {t("contentDetail.researchReference.title")}
                    </p>
                    <p className="text-label text-fg-secondary mt-1">
                      {t("contentDetail.researchReference.description")}
                    </p>
                    {researchLinks.map((reference) => (
                      <div
                        key={reference.id}
                        className="border-border mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3"
                      >
                        <div className="text-label text-fg-secondary">
                          <p className="font-semibold">
                            <bdi>{reference.accountName}</bdi> · <bdi>{reference.platform}</bdi>
                          </p>
                          <p className="text-fg-muted mt-1">
                            {reference.mediaType} · {reference.views ?? 0}{" "}
                            {t("contentDetail.researchReference.views")} · {reference.likes ?? 0}{" "}
                            {t("contentDetail.researchReference.likes")} · {reference.comments ?? 0}{" "}
                            {t("contentDetail.researchReference.comments")}
                          </p>
                        </div>
                        {reference.permalink ? (
                          <a
                            href={reference.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-label text-primary focus-visible:ring-focus-ring rounded font-semibold focus:outline-none focus-visible:ring-2"
                          >
                            {t("contentDetail.researchReference.openSource")}
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {item.channels.length > 0 ? (
                  <PlanningSection
                    id="creative"
                    title={t("contentDetail.sectionCreativeTitle")}
                    description={t("contentDetail.sectionCreativeDescription")}
                    collapsible
                    actions={
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="min-h-11 min-w-11" asChild>
                          <TabSwitchLink
                            href="#copy"
                            data-testid="content-open-copy"
                            aria-label={t("contentDetail.copy.openCopy")}
                            title={t("contentDetail.copy.openCopy")}
                          >
                            <CopyIcon className="h-4 w-4" aria-hidden="true" />
                          </TabSwitchLink>
                        </Button>
                        <Button variant="ghost" size="icon" className="min-h-11 min-w-11" asChild>
                          <TabSwitchLink
                            href="#preview"
                            data-testid="content-open-preview"
                            aria-label={t("contentDetail.openPreview")}
                            title={t("contentDetail.openPreview")}
                          >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          </TabSwitchLink>
                        </Button>
                      </div>
                    }
                  >
                    <div className="space-y-3">
                      {linkedTeardown ? (
                        <ResearchTeardownApply
                          workspaceSlug={slug}
                          contentItemId={item.id}
                          researchTeardownId={linkedTeardown.teardownId}
                          editable={canEdit}
                          labels={{
                            title: t("contentDetail.researchTeardownApply.title"),
                            description: t("contentDetail.researchTeardownApply.description"),
                            apply: t("contentDetail.researchTeardownApply.apply"),
                            applying: t("contentDetail.researchTeardownApply.applying"),
                            applied: t("contentDetail.researchTeardownApply.applied"),
                            nothingToApply: t("contentDetail.researchTeardownApply.nothingToApply"),
                            error: t("contentDetail.researchTeardownApply.error"),
                          }}
                        />
                      ) : null}
                      <FormatAwareContentEditor
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
                        excludeFields={AUDIENCE_COPY_KEYS}
                        {...(editableFields ? { editableFields } : {})}
                        locale={activeLocale}
                        aiEnabled={aiLive && captionDraftsEnabled}
                      />
                    </div>
                  </PlanningSection>
                ) : (
                  <PlanningSection
                    id="creative"
                    title={t("contentDetail.sectionCreativeTitle")}
                    description={t("contentDetail.sectionCreativeDescription")}
                    collapsible
                    actions={
                      <Button variant="ghost" size="icon" className="min-h-11 min-w-11" asChild>
                        <TabSwitchLink
                          href="#copy"
                          data-testid="content-open-copy"
                          aria-label={t("contentDetail.copy.openCopy")}
                          title={t("contentDetail.copy.openCopy")}
                        >
                          <CopyIcon className="h-4 w-4" aria-hidden="true" />
                        </TabSwitchLink>
                      </Button>
                    }
                  >
                    {linkedTeardown ? (
                      <ResearchTeardownApply
                        workspaceSlug={slug}
                        contentItemId={item.id}
                        researchTeardownId={linkedTeardown.teardownId}
                        editable={canEdit}
                        labels={{
                          title: t("contentDetail.researchTeardownApply.title"),
                          description: t("contentDetail.researchTeardownApply.description"),
                          apply: t("contentDetail.researchTeardownApply.apply"),
                          applying: t("contentDetail.researchTeardownApply.applying"),
                          applied: t("contentDetail.researchTeardownApply.applied"),
                          nothingToApply: t("contentDetail.researchTeardownApply.nothingToApply"),
                          error: t("contentDetail.researchTeardownApply.error"),
                        }}
                      />
                    ) : null}
                    <FormatAwareContentEditor
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
                      excludeFields={AUDIENCE_COPY_KEYS}
                      {...(editableFields ? { editableFields } : {})}
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
                      {t("contentDetail.aiAssistance")}
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
                          {...(linkedTrend
                            ? { trendContext: { id: linkedTrend.id, label: linkedTrend.label } }
                            : {})}
                          {...(researchLinks[0]
                            ? {
                                researchContext: {
                                  accountName: researchLinks[0].accountName,
                                  platform: researchLinks[0].platform,
                                },
                              }
                            : {})}
                        />
                      ) : null}
                      {canEdit ? (
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/app/w/${slug}/ai-settings`}>
                            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("contentDetail.aiSettings")}
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </section>
            ),
            delivery: (
              <section
                id="delivery"
                className="scroll-mt-24 space-y-4"
                data-testid="workspace-tab-panel-delivery"
              >
                <PlanningSection
                  id="assets-versions"
                  title={t("contentDetail.sectionAssetsTitle")}
                  description={t("contentDetail.sectionAssetsDescription")}
                  collapsible
                >
                  <DeliverySection
                    workspaceId={ws.id}
                    workspaceName={ws.name}
                    workspaceSlug={slug}
                    contentItemId={item.id}
                    contentStatus={item.status}
                    isDesigner={actorRoles.isDesigner}
                    isManager={actorRoles.isManager}
                    viewerIsClient={actorRoles.isClientReviewer}
                    mediaAssets={linkedMediaAssets.map((row) => ({
                      id: row.asset.id,
                      title: row.asset.title,
                      kind: row.object.kind,
                      mimeType: row.object.mimeType,
                      byteSize: row.object.byteSize,
                      workspaceName: row.workspaceName,
                      visibility: row.asset.visibility,
                      altText: row.asset.altText,
                    }))}
                    folderOptions={mediaFolders.map((folder) => ({
                      id: folder.id,
                      name: folder.name,
                      parentId: folder.parentId,
                    }))}
                    {...(canonicalDeliveryFolderId
                      ? { defaultFolderId: canonicalDeliveryFolderId }
                      : {})}
                    approvalGates={visiblePendingApprovalGates}
                    mediaRequired={item.mediaRequired}
                    canSetMediaRequired={
                      (actorRoles.isManager || actorRoles.isPlanner) && item.status !== "cancelled"
                    }
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
            ),
            "publish-settings": (
              <section
                id="publish-settings"
                className="scroll-mt-24"
                data-testid="workspace-publish-settings"
              >
                <PlanningSection
                  id="publish-schedule"
                  title={t("contentDetail.publishNavigator.schedule")}
                  description={t("contentDetail.publishWorkspace.scheduleDescription")}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="bg-primary-subtle text-primary inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)]">
                        <CalendarDays className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-label text-fg-muted font-semibold uppercase">
                          {t("contentDetail.overview.plannedPublish")}
                        </p>
                        <p className="text-body text-fg-primary truncate font-semibold">
                          {formatDate(item.plannedPublishAt, code, {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: ws.timezone,
                          })}
                        </p>
                        <p className="text-label text-fg-muted">{ws.timezone}</p>
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-2 lg:justify-center">
                      {channelConfigs.length > 0 ? (
                        channelConfigs.map((channel) => (
                          <span
                            key={channel.id}
                            className="border-border bg-surface-subtle text-label text-fg-secondary inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold"
                          >
                            <span
                              className="bg-primary h-1.5 w-1.5 rounded-full"
                              aria-hidden="true"
                            />
                            {humanPlatform(channel.platform, t)}
                            <span className="text-fg-muted">·</span>
                            <bdi>{channel.accountName}</bdi>
                          </span>
                        ))
                      ) : (
                        <span className="text-label text-fg-muted">
                          {t("contentDetail.overview.noChannels")}
                        </span>
                      )}
                    </div>
                    {canEditAll ? (
                      <Button asChild size="sm" variant="outline" className="shrink-0">
                        <Link href={editHref}>{t("contentDetail.overview.editDetails")}</Link>
                      </Button>
                    ) : null}
                  </div>
                </PlanningSection>
              </section>
            ),
            copy: (
              <section
                id="copy"
                className="mt-6 scroll-mt-24"
                data-testid="workspace-tab-panel-copy"
              >
                <MessagesPanel
                  workspaceSlug={slug}
                  contentItemId={item.id}
                  format={item.format as ContentFormat}
                  initialPayload={(() => {
                    try {
                      return parseFormatPayload(
                        item.format,
                        (item as { formatPayload?: unknown }).formatPayload,
                      ) as Record<string, unknown>;
                    } catch {
                      return { schemaVersion: 1 };
                    }
                  })()}
                  contentLocale={contentLocale}
                  channels={item.channels.map((ch) => ({
                    id: ch.id,
                    socialChannelId: ch.socialChannelId,
                    platform: ch.platform,
                    accountName: ch.accountName,
                    payload: ((channelPayloads as Record<string, unknown>)[ch.socialChannelId] ??
                      null) as Record<string, unknown> | null,
                    sourceRevision:
                      (
                        channelPayloadStates as Record<
                          string,
                          { copySourceRevision: number | null }
                        >
                      )[ch.socialChannelId]?.copySourceRevision ?? null,
                    currentRevision: item.revision,
                  }))}
                  canEdit={canEditCopy}
                  canManageChannels={canEditAll}
                />
              </section>
            ),
            preview: (
              <section className="mt-6 scroll-mt-24" data-testid="workspace-tab-panel-preview">
                {/* Preview tab — the platform simulator lives here,
                    full-width. Previously a sticky 360px right rail
                    inside the Content tab; moved here by the
                    /ui-ux-pro-max pass (2026-08-31) so the editor
                    + preview + workflow rail stop competing for
                    width. Future passes (master prompt §7) will
                    add a real Feed / Reel / Story / Carousel
                    surface here; the current `PlatformPreview`
                    is the minimal first pass. */}
                {item.channels.length === 0 ? (
                  <PlanningSection
                    id="preview"
                    title={t("contentDetail.preview.noChannelsTitle")}
                    description={
                      canEditAll
                        ? t("contentDetail.copy.noChannelsDescription")
                        : t("contentDetail.copy.noChannelsOwner")
                    }
                    testId="preview-empty"
                  >
                    {canEditAll ? (
                      <Button asChild size="sm" variant="outline">
                        <TabSwitchLink href="#overview">
                          {t("contentDetail.copy.openDetails")}
                        </TabSwitchLink>
                      </Button>
                    ) : null}
                  </PlanningSection>
                ) : (
                  <PlanningSection
                    id="preview"
                    title={t("contentDetail.preview.title")}
                    description={t("contentDetail.preview.description", {
                      platform: humanPlatform(item.channels[0]?.platform, t),
                      account:
                        item.channels[0]?.accountName ?? t("contentDetail.preview.noChannel"),
                    })}
                    collapsible
                  >
                    <div className="space-y-4">
                      {item.channels.length > 1 ? (
                        <p className="text-label text-fg-muted">
                          {t("contentDetail.preview.allChannels", {
                            count: item.channels.length,
                          })}
                        </p>
                      ) : null}
                      {item.channels[0]
                        ? (() => {
                            // P3 (2026-09-03, /ui-ux-pro-max): prefer the
                            // per-channel `platformPayload.caption` /
                            // `hashtags` when present (these reflect the
                            // publisher's per-channel override from the
                            // Publishing tab), then fall back to
                            // `formatPayload.caption` (the planner's
                            // single source of truth), then to the brief.
                            // The Preview tab used to read only
                            // `formatPayload` so per-channel edits
                            // silently did not show up here.
                            const copyView = buildAudienceCopyViewModel({
                              format: item.format,
                              formatPayload: (item as { formatPayload?: unknown }).formatPayload,
                            });
                            const plannerCaption = copyView.resolved.caption;
                            const plannerHashtags = copyView.resolved.hashtags;
                            const switcherChannels = item.channels.map((ch) => ({
                              id: ch.id,
                              socialChannelId: ch.socialChannelId,
                              platform: ch.platform,
                              accountName: ch.accountName,
                              contentFormat: item.format,
                              payload: (channelPayloads as Record<string, unknown>)[
                                ch.socialChannelId
                              ] as { caption?: string; hashtags?: string[] } | null,
                            }));
                            // P5 (2026-09-04, /ui-ux-pro-max round 5):
                            // pick the first image-kind asset linked to
                            // this content item so the preview actually
                            // renders the creative (was: always empty).
                            // `PlatformPreview.useImageDimensions` loads
                            // the bytes and feeds the aspect-ratio
                            // diagnostic — so the planner sees both the
                            // image AND a "fits / will be cropped"
                            // verdict against the platform's safe ratio.
                            // The signed R2 URL was computed at the top
                            // of the page render (see firstImageSignedPreviewUrl
                            // below). Falls back to `/preview` (PR 2) and
                            // finally to the full URL when no signed URL
                            // was issued (legacy asset / no preview yet).
                            const firstAssetHasPreview =
                              !!firstImageAsset?.object.previewStorageObjectId;
                            const thumbnailUrl = firstImageAsset
                              ? (firstImageSignedPreviewUrl ??
                                (firstAssetHasPreview
                                  ? `/api/media/assets/${encodeURIComponent(firstImageAsset.asset.id)}/preview`
                                  : `/api/media/assets/${encodeURIComponent(firstImageAsset.asset.id)}`))
                              : null;
                            // Forward the stored intrinsic dimensions so
                            // `PlatformPreview` does not need a second
                            // client-side probe of the same image. Sourced
                            // from `storage_objects.width/height` via
                            // `listMediaAssetsForContentItem`. Null on
                            // legacy assets where extraction failed; the
                            // probe fallback inside PlatformPreview handles
                            // those.
                            const thumbnailWidth = firstImageAsset?.object.width ?? null;
                            const thumbnailHeight = firstImageAsset?.object.height ?? null;
                            return (
                              <PlatformPreviewSwitcher
                                channels={switcherChannels}
                                sharedCaption={plannerCaption ?? item.brief ?? ""}
                                {...(plannerHashtags ? { sharedHashtags: plannerHashtags } : {})}
                                {...(thumbnailUrl ? { thumbnailUrl } : {})}
                                {...(thumbnailWidth !== null ? { thumbnailWidth } : {})}
                                {...(thumbnailHeight !== null ? { thumbnailHeight } : {})}
                              />
                            );
                          })()
                        : null}
                    </div>
                  </PlanningSection>
                )}
              </section>
            ),
            publishing: (
              <section
                id="publishing"
                className="mt-6 scroll-mt-24 space-y-4"
                data-testid="workspace-tab-panel-publishing"
              >
                <PublishingCommandCenter
                  channelCount={item.channels.length}
                  readyChannelCount={
                    readiness.channels.filter((channel) => channel.blockerCount === 0).length
                  }
                  blockerCount={readiness.blockers}
                  publishingSetupReady={publishingSetupReady}
                  outcomesRecorded={publicationByChannel.size}
                  issues={readiness.issues}
                  compact
                  workflowAtPublishingSetup={
                    item.status === "ready_to_publish" ||
                    item.status === "partially_published" ||
                    item.status === "published"
                  }
                  t={t}
                />
                {approvedBeforeLaterEdits ? (
                  <div
                    className="border-primary/30 bg-primary-subtle/30 text-fg-primary rounded-[var(--radius-card)] border p-4"
                    role="status"
                    data-testid="publish-approved-before-later-edits"
                  >
                    <p className="text-body font-semibold">
                      {t("contentDetail.copy.approvedBeforeLaterEdits")}
                    </p>
                  </div>
                ) : null}
                {/*
                Phase 7 of the planning-detail refactor (2026-08-30)
                absorbed the standalone `/publish` route into the
                Publishing tab. The full `PublishPackageForm` is
                intentionally first: it is the setup work users must
                complete before recording a publication outcome. The
                `ChannelPublishingCard` list follows it and keeps the
                per-channel outcome action visible for publishers and
                managers.

                The previous "Open publishing setup" deep-link is
                gone — the form is in front of the user. The
                `/publish` route still exists as a server-side
                redirect (see `publish/page.tsx`).
              */}
                {item.channels.length > 0 ? (
                  <PlanningSection
                    id="publish-package"
                    title={t("contentDetail.publishWorkspace.packageTitle")}
                    description={t("contentDetail.publishWorkspace.packageDescription")}
                    className="mt-4"
                    testId="publish-package-form-section"
                  >
                    <div data-testid="publish-package-form-mount">
                      <PublishPackageForm
                        workspaceId={ws.id}
                        workspaceSlug={slug}
                        workspaceTimezone={ws.timezone}
                        contentItemId={item.id}
                        itemFormat={item.format}
                        contentLocale={contentLocale}
                        audienceCopy={buildAudienceCopyViewModel({
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
                          payload: ((channelPayloads as Record<string, unknown>)[
                            c.socialChannelId
                          ] ?? null) as never,
                          copySourceRevision:
                            (
                              channelPayloadStates as Record<
                                string,
                                { copySourceRevision: number | null }
                              >
                            )[c.socialChannelId]?.copySourceRevision ?? null,
                          // The row timestamp, used as the optimistic
                          // concurrency token. `copySourceRevision` is
                          // provenance and cannot serve as a write token.
                          updatedAt:
                            (channelPayloadStates as Record<string, { updatedAt?: string | null }>)[
                              c.socialChannelId
                            ]?.updatedAt ?? null,
                          ...(publicationByChannel.get(c.id)?.publication_record?.status
                            ? {
                                publicationStatus: publicationByChannel.get(c.id)!
                                  .publication_record.status,
                              }
                            : {}),
                        }))}
                        deliveryVersions={deliveries.map((d) => ({
                          id: d.id,
                          versionNumber: d.versionNumber,
                          isFinalApproved: d.isFinalApproved,
                        }))}
                        readiness={readiness}
                        canSavePackage={canSavePackage}
                        workflowAtPublishingSetup={
                          item.status === "ready_to_publish" ||
                          item.status === "partially_published" ||
                          item.status === "published"
                        }
                        canApproveFinalCopy={canApproveFinalCopy}
                        canConfirmReadiness={canConfirmReadiness}
                        canExcludeChannel={
                          (actorRoles.isPublisher || actorRoles.isManager) &&
                          (item.status === "ready_to_publish" ||
                            item.status === "partially_published")
                        }
                        publishingSetupReady={publishingSetupReady}
                        metaPublishingReadiness={metaPublishingReadiness}
                        metaPublishingCopy={metaPublishingCopy}
                        {...(publishPreviewData ? { previewData: publishPreviewData } : {})}
                        aiCaptionDraftsEnabled={aiLive && captionDraftsEnabled}
                        {...(!hasKey
                          ? {
                              aiCaptionDisabledReason: t(
                                "contentDetail.aiAssistanceSurface.offReasons.noKey",
                              ),
                            }
                          : {})}
                      />
                    </div>
                  </PlanningSection>
                ) : null}

                {item.channels.length === 0 ? (
                  <div
                    className="border-border bg-surface-subtle rounded-[var(--radius-card)] border p-4"
                    role="status"
                    data-testid="publishing-empty-no-channels"
                  >
                    <p className="text-body text-fg-secondary">
                      {canEditAll
                        ? t("contentDetail.copy.noChannelsDescription")
                        : t("contentDetail.copy.noChannelsOwner")}
                    </p>
                    {canEditAll ? (
                      <Button asChild size="sm" variant="outline" className="mt-3">
                        <TabSwitchLink href="#overview">
                          {t("contentDetail.copy.openDetails")}
                        </TabSwitchLink>
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <PlanningSection
                    id="publish-outcomes"
                    title={t("contentDetail.publishNavigator.outcomes")}
                    description={
                      outcomesUnlocked
                        ? t("contentDetail.publishWorkspace.outcomesDescription")
                        : t("contentDetail.publishWorkspace.outcomesLockedDescription")
                    }
                    collapsible
                    defaultOpen={outcomesUnlocked}
                  >
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
                              connectionStatus: ch.connectionStatus,
                              externalAccountId: ch.externalAccountId,
                              targetDate:
                                ch.plannedPublishAtOverride?.toISOString() ??
                                item.plannedPublishAt?.toISOString() ??
                                null,
                              searchText: [item.title, item.brief].filter(Boolean).join(" "),
                              timeZone: ws.timezone,
                            }}
                            publication={
                              pub
                                ? {
                                    ...pub.publication_record,
                                    externalLastSyncedAt:
                                      pub.publication_record.externalLastSyncedAt?.toISOString() ??
                                      null,
                                    expiresAt:
                                      pub.publication_record.expiresAt?.toISOString() ?? null,
                                  }
                                : null
                            }
                            isPublisher={actorRoles.isPublisher || actorRoles.isManager}
                            defaultOpen={ch.id === firstPendingOutcomeChannelId}
                          />
                        );
                      })}
                    </div>
                  </PlanningSection>
                )}
              </section>
            ),
            activity: (
              <section
                id="activity"
                className="mt-6 scroll-mt-24 space-y-4"
                data-testid="workspace-tab-panel-activity"
              >
                {/* Lifecycle events — only when there's at least one.
                  Phase 7 of the three-zone refactor (2026-08-30)
                  replaces the previous "Activity" card with an
                  intentional empty state that sits near the
                  useful content area rather than stretching to
                  fill the entire viewport. */}
                {activityEvents.length > 0 ? (
                  <ActivityWithFilters events={activityWithTarget} />
                ) : (
                  <div
                    className="border-border bg-surface-subtle mx-auto flex max-w-md flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed px-6 py-10 text-center"
                    data-testid="activity-empty-state"
                    role="status"
                  >
                    <Clock className="text-fg-muted h-10 w-10" aria-hidden="true" />
                    <h3 className="text-title-card text-fg-primary font-semibold">
                      {t("contentDetail.activity.emptyTitle")}
                    </h3>
                    <p className="text-body text-fg-secondary max-w-sm">
                      {t("contentDetail.activity.emptyBody")}
                    </p>
                  </div>
                )}
              </section>
            ),
          },
          canResetIdea,
          resetCounts,
          activityCount: activityEvents.length,
          openCommentCount: openCommentsCount,
          mentionCount,
          canManageContentActions:
            (actorRoles.isManager || actorRoles.isPlanner) && item.status !== "cancelled",
          sourceFormat: item.format as ContentFormat,
        }}
        footer={
          <p className="text-label text-fg-muted text-center">
            {t("contentDetail.footer.updatedRevision", {
              time: formatDate(item.updatedAt, code, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: ws.timezone,
              }),
              revision: readiness.revision,
            })}
          </p>
        }
      />
    </div>
  );
}
