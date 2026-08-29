import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil, ArrowLeft, ExternalLink } from "lucide-react";
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
import { ActivityTimeline } from "@/components/planning/activity-timeline";
import { FormatPayloadEditor } from "@/components/forms/format-payload-editor";
import { InlineBriefEditor, InlineDateEditor, InlineTitleEditor } from "./inline-editable-fields";
import { WorkflowBar } from "./workflow-bar";
import { DeliverySection } from "./delivery-section";
import { DiscussionSection } from "./discussion-section";
import { AiAssistanceSection } from "./ai-assistance-section";
import { ResetIdeaSection } from "./reset-idea-section";
import { getResetIdeaCounts, EMPTY_RESET_IDEA_COUNTS } from "@/lib/content/reset-idea";
import { EditIdeaButton } from "./edit-button";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { db } from "@/lib/db";
import { aiFeatureSettings, agencies, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isAiEnabled } from "@/lib/ai";
import { AI_CAPABILITY_METADATA } from "@/lib/ai/capabilities";
import { parseFormatPayload } from "@/lib/format-payload/schemas";
import { listActivityEvents } from "@/lib/notifications/activity";
import { readAllChannelPayloads } from "@/lib/publishing";

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

  // One parallel batch for everything the page renders.
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

  // AI capability allowlist
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

  // Owner display
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

  // Per-channel publish package status: a channel is "configured"
  // when its payload has a `selectedDestinationProfile` set.
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

  // Build a publication record map keyed by contentItemChannelId
  const publicationByChannel = new Map<string, (typeof publications)[number]>();
  for (const p of publications) {
    if (p.publication_record) {
      publicationByChannel.set(p.publication_record.contentItemChannelId, p);
    }
  }

  // Per-channel readiness issues — used by the ChannelPublishingCard
  // and aggregated into the global ReadinessPanel.
  const presentationIssues = presentReadinessIssues(readiness.issues);

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
        primaryAction={
          canEdit ? (
            <Button variant="outline" asChild>
              <Link href={`/app/w/${slug}/planning/edit/${item.id}`} data-testid="open-full-edit">
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Edit all fields
              </Link>
            </Button>
          ) : (
            <Button variant="ghost" asChild>
              <Link href={`/app/w/${slug}/planning`} data-testid="planning-back-link">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Back to planning
              </Link>
            </Button>
          )
        }
        secondaryActions={
          canEdit ? <EditIdeaButton workspaceSlug={slug} contentItemId={item.id} /> : null
        }
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

      {/* Readiness — only shown when there are blockers / recommendations */}
      {readiness.blockers > 0 || readiness.recommendations > 0 ? (
        <ReadinessPanel
          ready={readiness.canPublish}
          blockers={readiness.blockers}
          recommendations={readiness.recommendations}
          issues={presentationIssues}
        />
      ) : null}

      {/* Brief — inline editable. The user can also click the
          "Edit all fields" button in the header for the full
          edit form. */}
      <PlanningSection
        id="brief"
        title="Brief"
        description={
          canEdit
            ? "Click the pencil to edit in place, or open the full editor for every field."
            : "The brief that was approved. Changes require a fresh review."
        }
        actions={
          canEdit ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/app/w/${slug}/planning/edit/${item.id}`}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Open full editor
              </Link>
            </Button>
          ) : null
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

      {/* Title + planned date — also inline editable. Two
          side-by-side fields for the at-a-glance scan. */}
      <PlanningSection
        id="schedule"
        title="Schedule"
        description="When this item is supposed to go live."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="text-label text-fg-secondary font-semibold uppercase">Title</p>
            {canEdit ? (
              <InlineTitleEditor workspaceSlug={slug} contentItemId={item.id} value={item.title} />
            ) : (
              <p className="text-body text-fg-primary font-semibold">{item.title}</p>
            )}
          </div>
          <div>
            <p className="text-label text-fg-secondary font-semibold uppercase">Planned publish</p>
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

      {/* Channels + publish package — the publish-package
          configurator lives on its own page. Each channel
          here is a quick-glance row with a link to the
          publish package and a per-channel "Record outcome"
          action (rendered as a card by ChannelPublishingCard
          below in the publishing section). */}
      <PlanningSection
        id="channels"
        title="Channels"
        description={
          item.channels.length === 0
            ? "Add at least one social channel to publish this item to."
            : `${item.channels.length} channel${item.channels.length === 1 ? "" : "s"} selected.`
        }
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link
              href={`/app/w/${slug}/planning/${item.id}/publish`}
              data-testid="open-publish-package"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Open publish package
            </Link>
          </Button>
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
                  <span className="text-body text-fg-primary font-semibold">{ch.accountName}</span>
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

      {/* Per-format creative fields — the existing disclosure
          editor. The AI per-field buttons are the primary
          AI surface for caption / hook / CTA. The standalone
          AI section below offers the higher-level
          brief-improvement / campaign-ideas / completeness
          capabilities. */}
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

      {/* AI — the standalone capabilities. Per-field AI lives
          in the format editor; this section offers the
          higher-level entry points (improve brief, ideas,
          platform adaptation, completeness check). */}
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
          currentBrief={item.brief ?? ""}
        />
      ) : null}

      {/* Delivery — design uploads + final approval */}
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

      {/* Publishing — per channel, with inline record-outcome forms.
          Channels with no configuration show a "In setup" badge
          and a "Configure publish package" link. */}
      <PlanningSection
        id="publishing"
        title="Publishing"
        description="Per-channel publish outcomes. Configure captions / disclosures on the publish package page."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link
              href={`/app/w/${slug}/planning/${item.id}/publish`}
              data-testid="open-publish-package-from-publishing"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Open publish package
            </Link>
          </Button>
        }
      >
        {item.channels.length === 0 ? (
          <p className="text-body text-fg-muted">
            No channels selected. Add a channel first, then configure the publish package.
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

      {/* Discussion — uses the new CommentComposer with mention
          autocomplete. The mention picker is wired to
          /api/mentions/search. */}
      <PlanningSection
        id="discussion"
        title="Discussion"
        description="Comments and replies. Use @ to mention a teammate."
      >
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
          canPostInternal={canPostInternal}
          canPostClientVisible={canPostClientVisible}
        />
      </PlanningSection>

      {/* Activity — lifecycle events, separate from the
          discussion thread. */}
      <ActivityTimeline events={activityEvents} />

      {/* Reset (Danger Zone) — destructive, agency operator only. */}
      {canResetIdea ? (
        <ResetIdeaSection
          workspaceSlug={slug}
          contentItemId={item.id}
          ideaTitle={item.title}
          counts={resetCounts}
        />
      ) : null}

      {/* Audit row — meta info that doesn't fit anywhere else */}
      <p className="text-label text-fg-muted text-center">
        Last updated {item.updatedAt.toLocaleString()} · Revision {readiness.revision}
      </p>
    </div>
  );
}
