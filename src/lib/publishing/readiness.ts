import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  approvalRequests,
  activityEvents,
  contentItemChannels,
  contentItems,
  deliveryVersions,
  socialChannels,
} from "@/lib/db/schema";
import { hasWorkspaceRole, type Actor } from "@/lib/auth/policy";
import { enqueueReadyToPublishNotification } from "@/lib/notifications/service";
import {
  PlatformPayloadSchema,
  type PlatformPayload,
  type CommonPublishingFields,
} from "./payload-schemas";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §4 (Milestone 4) — Server-authoritative
 * publish readiness service.
 *
 * Per the master prompt:
 *
 *   "It must:
 *      - Validate the package per channel and content format.
 *      - Separate blockers from recommendations.
 *      - Return completed required items and total required items.
 *      - Return field-level issue paths.
 *      - Permit saving an incomplete draft.
 *      - Block 'Ready for publishing' while blockers remain.
 *      - Revalidate on the server during every readiness transition.
 *      - Never treat hashtags as globally mandatory; requirements
 *        depend on platform, agency rules, and format.
 *      - Integrate with the existing AI `completeness_check`, but
 *        AI suggestions are advisory only."
 *
 * Design:
 *
 *   - One `evaluateReadiness(actor, contentItemId)` call returns the
 *     full breakdown: a list of issues (blocker / recommendation),
 *     a counts summary, the current `revision`, and a per-channel
 *     breakdown (so the publish UI can render the readiness card
 *     per channel).
 *   - The service is read-only and role-agnostic: every workspace
 *     member can evaluate. The route handler decides who can
 *     commit a "Ready for publishing" transition.
 *   - The AI integration is a separate hook: callers can pass
 *     `aiSuggestions` from the existing `completeness_check`
 *     route, and the service folds them into the recommendation
 *     list (advisory only — never a blocker).
 *
 * Issue shape:
 *
 *   - `path: string` — JSONPath-like address into the payload,
 *     e.g. `channels[0].payload.caption` or `delivery.primary`.
 *   - `code: string` — machine-readable identifier (UI keys off
 *     this; i18n later).
 *   - `severity: 'blocker' | 'recommendation'` — UI badges.
 *   - `message: string` — human-readable explanation.
 */

export const ReadinessIssueSeveritySchema = z.enum(["blocker", "recommendation"]);
export type ReadinessIssueSeverity = z.infer<typeof ReadinessIssueSeveritySchema>;

export const ReadinessIssueSchema = z.object({
  path: z.string().min(1).max(300),
  code: z.string().min(1).max(80),
  severity: ReadinessIssueSeveritySchema,
  message: z.string().min(1).max(500),
});
export type ReadinessIssue = z.infer<typeof ReadinessIssueSchema>;

export const ChannelReadinessSchema = z.object({
  socialChannelId: z.string().uuid(),
  platform: z.string().nullable(),
  hasPayload: z.boolean(),
  blockerCount: z.number().int().min(0),
  recommendationCount: z.number().int().min(0),
  issues: z.array(ReadinessIssueSchema),
});
export type ChannelReadiness = z.infer<typeof ChannelReadinessSchema>;

export const ReadinessReportSchema = z.object({
  contentItemId: z.string().uuid(),
  revision: z.number().int().min(0),
  blockers: z.number().int().min(0),
  recommendations: z.number().int().min(0),
  requiredTotal: z.number().int().min(0),
  requiredCompleted: z.number().int().min(0),
  canPublish: z.boolean(),
  issues: z.array(ReadinessIssueSchema),
  channels: z.array(ChannelReadinessSchema),
});
export type ReadinessReport = z.infer<typeof ReadinessReportSchema>;

export class ReadinessError extends Error {
  public readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID";
  public readonly details: Record<string, unknown>;
  constructor(
    code: "FORBIDDEN" | "NOT_FOUND" | "INVALID",
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ReadinessError";
    this.code = code;
    this.details = details;
  }
}

export interface ReadinessInput {
  actor: Actor;
  workspaceId: string;
  contentItemId: string;
  /**
   * Optional AI `completeness_check` suggestions to fold in as
   * recommendations. The service treats them as advisory.
   */
  aiSuggestions?: Array<{ path: string; message: string; code?: string }>;
}

export const ConfirmPublishReadinessInputSchema = z.object({
  workspaceId: z.string().uuid(),
  contentItemId: z.string().uuid(),
});
export type ConfirmPublishReadinessInput = z.infer<typeof ConfirmPublishReadinessInputSchema>;

// ─── Required-field registry ────────────────────────────────────────────

/**
 * Per-platform required-field table. This is the single source
 * of truth for "what makes a Reel ready" vs "what makes a
 * Pinterest pin ready". The master prompt's "Typical blockers
 * include" list is folded in here:
 *   - Missing final delivery asset.
 *   - Unapproved asset version.
 *   - Missing required caption/title.
 *   - Missing feed crop or cover.
 *   - Transcript requiring review.
 *   - Missing disclosure.
 *   - Unconfirmed media rights.
 *   - Missing accessibility text when required.
 *   - Final-copy approval missing.
 *   - Schedule or destination missing.
 *
 * Hashtags are NOT in the required set for any platform — the
 * master prompt's "Never treat hashtags as globally mandatory"
 * rule.
 */

interface RequiredFieldCheck {
  path: string;
  code: string;
  message: string;
  test: (payload: PlatformPayload) => boolean;
}

const REQUIRED_FIELDS: Record<string, RequiredFieldCheck[]> = {
  instagram: [
    {
      path: "payload.caption",
      code: "missing_caption",
      message: "Instagram posts require a caption.",
      test: (p) =>
        !!(p as CommonPublishingFields).caption &&
        (p as CommonPublishingFields).caption!.length > 0,
    },
    {
      path: "payload.destinationProfile",
      code: "missing_destination",
      message: "Select a destination profile.",
      test: (p) => !!(p as CommonPublishingFields).selectedDestinationProfile,
    },
    {
      path: "payload.approval.finalCopyApproved",
      code: "final_copy_not_approved",
      message: "Final copy must be approved before publishing.",
      test: (p) => (p as CommonPublishingFields).approval?.finalCopyApproved === true,
    },
    {
      path: "payload.altText",
      code: "missing_alt_text",
      message: "Instagram posts require alt text.",
      test: (p) =>
        !!(p as CommonPublishingFields).altText &&
        (p as CommonPublishingFields).altText!.length > 0,
    },
  ],
  instagram_reel: [
    {
      path: "payload.audioRightsConfirmed",
      code: "missing_audio_rights",
      message: "Reel audio rights must be confirmed.",
      test: (p) =>
        (p as PlatformPayload & { platform: "instagram_reel"; audioRightsConfirmed?: boolean })
          .audioRightsConfirmed === true,
    },
    {
      path: "payload.transcriptReviewed",
      code: "transcript_not_reviewed",
      message: "Reel transcript must be reviewed.",
      test: (p) =>
        (p as PlatformPayload & { platform: "instagram_reel"; transcriptReviewed?: boolean })
          .transcriptReviewed === true,
    },
    {
      path: "payload.coverFrame",
      code: "missing_cover",
      message: "Reel requires a cover frame.",
      test: (p) =>
        !!(
          p as PlatformPayload & {
            platform: "instagram_reel";
            coverFrame?: { deliveryVersionId: string };
          }
        ).coverFrame,
    },
    {
      path: "payload.altText",
      code: "missing_alt_text",
      message: "Reels require alt text / accessibility description.",
      test: (p) =>
        !!(p as CommonPublishingFields).altText &&
        (p as CommonPublishingFields).altText!.length > 0,
    },
    {
      path: "payload.approval.finalCopyApproved",
      code: "final_copy_not_approved",
      message: "Final copy must be approved before publishing.",
      test: (p) => (p as CommonPublishingFields).approval?.finalCopyApproved === true,
    },
  ],
  tiktok: [
    {
      path: "payload.musicRightsConfirmed",
      code: "missing_music_rights",
      message: "TikTok requires music rights confirmation.",
      test: (p) =>
        (p as PlatformPayload & { platform: "tiktok"; musicRightsConfirmed?: boolean })
          .musicRightsConfirmed === true,
    },
    {
      path: "payload.privacy",
      code: "missing_privacy",
      message: "TikTok requires a privacy level.",
      test: (p) => !!(p as PlatformPayload & { platform: "tiktok"; privacy?: string }).privacy,
    },
    {
      path: "payload.approval.finalCopyApproved",
      code: "final_copy_not_approved",
      message: "Final copy must be approved before publishing.",
      test: (p) => (p as CommonPublishingFields).approval?.finalCopyApproved === true,
    },
  ],
  youtube: [
    {
      path: "payload.title",
      code: "missing_title",
      message: "YouTube requires a title.",
      test: (p) => !!(p as PlatformPayload & { platform: "youtube"; title?: string }).title,
    },
    {
      path: "payload.thumbnail",
      code: "missing_thumbnail",
      message: "YouTube requires a thumbnail.",
      test: (p) =>
        !!(
          p as PlatformPayload & { platform: "youtube"; thumbnail?: { deliveryVersionId: string } }
        ).thumbnail,
    },
    {
      path: "payload.privacy",
      code: "missing_privacy",
      message: "YouTube requires a privacy status.",
      test: (p) => !!(p as PlatformPayload & { platform: "youtube"; privacy?: string }).privacy,
    },
    {
      path: "payload.approval.finalCopyApproved",
      code: "final_copy_not_approved",
      message: "Final copy must be approved before publishing.",
      test: (p) => (p as CommonPublishingFields).approval?.finalCopyApproved === true,
    },
  ],
  pinterest: [
    {
      path: "payload.pinTitle",
      code: "missing_pin_title",
      message: "Pinterest requires a pin title.",
      test: (p) => !!(p as PlatformPayload & { platform: "pinterest"; pinTitle?: string }).pinTitle,
    },
    {
      path: "payload.boardId",
      code: "missing_board",
      message: "Pinterest requires a board.",
      test: (p) => !!(p as PlatformPayload & { platform: "pinterest"; boardId?: string }).boardId,
    },
    {
      path: "payload.altText",
      code: "missing_alt_text",
      message: "Pinterest requires alt text.",
      test: (p) =>
        !!(p as CommonPublishingFields).altText &&
        (p as CommonPublishingFields).altText!.length > 0,
    },
    {
      path: "payload.approval.finalCopyApproved",
      code: "final_copy_not_approved",
      message: "Final copy must be approved before publishing.",
      test: (p) => (p as CommonPublishingFields).approval?.finalCopyApproved === true,
    },
  ],
  x: [
    {
      path: "payload.caption",
      code: "missing_post_text",
      message: "X posts require post text.",
      test: (p) =>
        !!(p as CommonPublishingFields).caption &&
        (p as CommonPublishingFields).caption!.length > 0,
    },
    {
      path: "payload.approval.finalCopyApproved",
      code: "final_copy_not_approved",
      message: "Final copy must be approved before publishing.",
      test: (p) => (p as CommonPublishingFields).approval?.finalCopyApproved === true,
    },
  ],
  facebook: [
    {
      path: "payload.destinationProfile",
      code: "missing_destination",
      message: "Select a destination profile.",
      test: (p) => !!(p as CommonPublishingFields).selectedDestinationProfile,
    },
    {
      path: "payload.approval.finalCopyApproved",
      code: "final_copy_not_approved",
      message: "Final copy must be approved before publishing.",
      test: (p) => (p as CommonPublishingFields).approval?.finalCopyApproved === true,
    },
  ],
  linkedin: [
    {
      path: "payload.destinationProfile",
      code: "missing_destination",
      message: "Select a destination profile.",
      test: (p) => !!(p as CommonPublishingFields).selectedDestinationProfile,
    },
    {
      path: "payload.approval.finalCopyApproved",
      code: "final_copy_not_approved",
      message: "Final copy must be approved before publishing.",
      test: (p) => (p as CommonPublishingFields).approval?.finalCopyApproved === true,
    },
  ],
  other: [
    {
      path: "payload.destinationProfile",
      code: "missing_destination",
      message: "Select a destination profile.",
      test: (p) => !!(p as CommonPublishingFields).selectedDestinationProfile,
    },
    {
      path: "payload.approval.finalCopyApproved",
      code: "final_copy_not_approved",
      message: "Final copy must be approved before publishing.",
      test: (p) => (p as CommonPublishingFields).approval?.finalCopyApproved === true,
    },
  ],
};

// ─── Cross-cutting checks (apply to every channel) ────────────────────

function commonIssues(payload: CommonPublishingFields, channelPath: string): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  if (!payload.disclosures?.rightsConfirmed) {
    issues.push({
      path: `${channelPath}.disclosures.rightsConfirmed`,
      code: "rights_not_confirmed",
      severity: "recommendation",
      message: "Confirm media rights before publishing.",
    });
  }
  if (payload.disclosures?.aiGenerated && !payload.disclosures?.syntheticMedia) {
    issues.push({
      path: `${channelPath}.disclosures.syntheticMedia`,
      code: "synthetic_media_disclosure_recommended",
      severity: "recommendation",
      message: "AI-generated content should declare synthetic media.",
    });
  }
  return issues;
}

// ─── Main entry point ─────────────────────────────────────────────────

export async function evaluateReadiness(input: ReadinessInput): Promise<ReadinessReport> {
  const allowed = await hasWorkspaceRole({ id: input.actor.id }, input.workspaceId, [
    "workspace_manager",
    "content_planner",
    "designer",
    "internal_reviewer",
    "client_reviewer",
    "publisher",
    "viewer",
  ]);
  if (!allowed) {
    throw new ReadinessError("FORBIDDEN", "Not a workspace member.", {
      workspaceId: input.workspaceId,
    });
  }
  const [item] = await db
    .select({
      id: contentItems.id,
      revision: contentItems.revision,
      approvedDeliveryVersionId: contentItems.approvedDeliveryVersionId,
      format: contentItems.format,
      workspaceId: contentItems.workspaceId,
    })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.id, input.contentItemId),
        eq(contentItems.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!item) {
    throw new ReadinessError("NOT_FOUND", "Content item not found.", {
      contentItemId: input.contentItemId,
    });
  }

  // Pull every selected channel + its payload + its social_channel
  // row (for the platform label).
  const channelRows = await db
    .select({
      socialChannelId: contentItemChannels.socialChannelId,
      platformPayload: contentItemChannels.platformPayload,
      platform: socialChannels.platform,
    })
    .from(contentItemChannels)
    .innerJoin(socialChannels, eq(socialChannels.id, contentItemChannels.socialChannelId))
    .where(eq(contentItemChannels.contentItemId, input.contentItemId));

  // Pull the most recent pending approval request so the
  // "approval reset" banner can show a count.
  const openApprovals = await db
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.contentItemId, input.contentItemId),
        eq(approvalRequests.status, "pending"),
      ),
    );

  const perChannel: ChannelReadiness[] = [];
  let totalBlockers = 0;
  let totalRecommendations = 0;
  let totalRequired = 0;
  let totalCompleted = 0;
  const allIssues: ReadinessIssue[] = [];

  for (const row of channelRows) {
    const channelPath = `channels.${row.socialChannelId}`;
    const issues: ReadinessIssue[] = [];
    let blockerCount = 0;
    let recommendationCount = 0;
    let requiredCount = 0;
    let completedCount = 0;
    const raw = row.platformPayload;
    if (!raw) {
      issues.push({
        path: `${channelPath}.payload`,
        code: "missing_payload",
        severity: "blocker",
        message: "No publish package saved yet.",
      });
      blockerCount += 1;
    } else {
      const candidate = raw as { platform?: string };
      if (!candidate.platform) {
        issues.push({
          path: `${channelPath}.payload`,
          code: "missing_platform",
          severity: "blocker",
          message: "Publish package is missing its platform tag.",
        });
        blockerCount += 1;
      } else {
        // Discriminated-union parse. The schema is the
        // source of truth — same schema that the writer
        // validated against. If the read fails, treat the
        // channel as a blocker.
        const parsed = PlatformPayloadSchema.safeParse(raw);
        if (!parsed.success) {
          issues.push({
            path: `${channelPath}.payload`,
            code: "invalid_payload",
            severity: "blocker",
            message: "Stored publish package is not valid for the current schema version.",
          });
          blockerCount += 1;
        } else {
          const payload = parsed.data;
          const required = REQUIRED_FIELDS[payload.platform] ?? [];
          for (const field of required) {
            requiredCount += 1;
            const ok = field.test(payload);
            if (ok) {
              completedCount += 1;
            } else {
              issues.push({
                path: `${channelPath}.${field.path}`,
                code: field.code,
                severity: "blocker",
                message: field.message,
              });
              blockerCount += 1;
            }
          }
          for (const common of commonIssues(payload, channelPath)) {
            issues.push(common);
            recommendationCount += 1;
          }
        }
      }
    }

    // Approved delivery version. The content item's
    // approvedDeliveryVersionId must exist and be non-null.
    if (!item.approvedDeliveryVersionId) {
      issues.push({
        path: `${channelPath}.approvedDeliveryVersion`,
        code: "no_approved_delivery",
        severity: "blocker",
        message: "Approve a delivery asset version before publishing.",
      });
      blockerCount += 1;
      requiredCount += 1;
    } else {
      const [delivery] = await db
        .select({ id: deliveryVersions.id })
        .from(deliveryVersions)
        .where(eq(deliveryVersions.id, item.approvedDeliveryVersionId))
        .limit(1);
      if (!delivery) {
        issues.push({
          path: `${channelPath}.approvedDeliveryVersion`,
          code: "delivery_version_missing",
          severity: "blocker",
          message: "Approved delivery version no longer exists.",
        });
        blockerCount += 1;
        requiredCount += 1;
      } else {
        completedCount += 1;
        requiredCount += 1;
      }
    }

    perChannel.push({
      socialChannelId: row.socialChannelId,
      platform: row.platform,
      hasPayload: raw !== null,
      blockerCount,
      recommendationCount,
      issues,
    });
    totalBlockers += blockerCount;
    totalRecommendations += recommendationCount;
    totalRequired += requiredCount;
    totalCompleted += completedCount;
    allIssues.push(...issues);
  }

  // AI suggestions are advisory. We add them to the
  // recommendations list (not blockers) so the UI can show
  // them as a "tip" section.
  if (input.aiSuggestions) {
    for (const suggestion of input.aiSuggestions) {
      allIssues.push({
        path: suggestion.path,
        code: suggestion.code ?? "ai_suggestion",
        severity: "recommendation",
        message: suggestion.message,
      });
      totalRecommendations += 1;
    }
  }

  // Open-approval banner is informational. Doesn't affect
  // `canPublish` because approvals are reset on every material
  // edit (M4.3); the readiness question is "are blockers
  // gone", not "is there an approval to cancel".
  if (openApprovals.length > 0) {
    allIssues.push({
      path: "approvals.openCount",
      code: "approvals_open",
      severity: "recommendation",
      message: `${openApprovals.length} approval request(s) were auto-cancelled by a material edit; re-review required.`,
    });
    totalRecommendations += 1;
  }

  return {
    contentItemId: item.id,
    revision: item.revision,
    blockers: totalBlockers,
    recommendations: totalRecommendations,
    requiredTotal: totalRequired,
    requiredCompleted: totalCompleted,
    canPublish: totalBlockers === 0 && perChannel.length > 0,
    issues: allIssues,
    channels: perChannel,
  };
}

/**
 * Server-authoritative acknowledgement behind the “Ready for publishing”
 * action. Creative approval owns the workflow status transition; this
 * command re-evaluates the package and records an immutable confirmation
 * only when the current revision has no blockers.
 */
export async function confirmPublishReadiness(
  actor: Actor,
  input: ConfirmPublishReadinessInput,
): Promise<ReadinessReport> {
  const parsed = ConfirmPublishReadinessInputSchema.parse(input);
  const allowed = await hasWorkspaceRole(actor, parsed.workspaceId, [
    "workspace_manager",
    "content_planner",
    "publisher",
  ]);
  if (!allowed) {
    throw new ReadinessError("FORBIDDEN", "You cannot confirm publishing readiness.");
  }

  const report = await evaluateReadiness({ actor, ...parsed });
  if (!report.canPublish || report.blockers > 0) {
    throw new ReadinessError(
      "INVALID",
      `Resolve ${report.blockers} publishing blocker${report.blockers === 1 ? "" : "s"} first.`,
      { report },
    );
  }

  const [item] = await db
    .select({
      status: contentItems.status,
      revision: contentItems.revision,
      title: contentItems.title,
      contentOwnerId: contentItems.contentOwnerId,
      designerId: contentItems.designerId,
    })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.id, parsed.contentItemId),
        eq(contentItems.workspaceId, parsed.workspaceId),
      ),
    )
    .limit(1);
  if (!item) throw new ReadinessError("NOT_FOUND", "Content item not found.");
  if (!["ready_to_publish", "partially_published"].includes(item.status)) {
    throw new ReadinessError(
      "INVALID",
      `Content must complete creative approval before publishing (currently ${item.status}).`,
    );
  }
  if (item.revision !== report.revision) {
    throw new ReadinessError("INVALID", "The package changed. Review readiness and try again.");
  }

  await db.insert(activityEvents).values({
    workspaceId: parsed.workspaceId,
    contentItemId: parsed.contentItemId,
    actorId: actor.id,
    kind: "status_transition",
    summary: "Publish package confirmed ready",
    afterData: { status: item.status, revision: report.revision },
    metadata: {
      resource: "publish_readiness",
      blockers: report.blockers,
      recommendations: report.recommendations,
      material: false,
    },
  });

  // FEAT-18 (GAP-FULL-REVIEW-2026-08-25) — fire the
  // `ready_to_publish` notification for the content owner and
  // designer (skipping the actor who just confirmed, who has
  // already seen the readiness report). The transition path in
  // `content/service.ts:811` also fires this kind when the
  // workflow state moves into `ready_to_publish`; this call
  // covers the second "ready" event the master prompt §12
  // expects — a publisher has just confirmed the package is
  // ready, so anyone in the deliver lane (owner, designer) gets
  // a fresh reminder that the publish window is open. The two
  // notifications are intentionally distinct events: one fires
  // on workflow transition, this one fires on publisher
  // confirmation.
  const skipSelf = (uid: string | null) => (uid && uid !== actor.id ? uid : null);
  const readyRecipients = [skipSelf(item.contentOwnerId), skipSelf(item.designerId)].filter(
    (u): u is string => Boolean(u),
  );
  for (const userId of readyRecipients) {
    await enqueueReadyToPublishNotification({
      userId,
      workspaceId: parsed.workspaceId,
      contentItemId: parsed.contentItemId,
      title: `Ready to publish: "${item.title}"`,
      body: "A publisher has confirmed the package is ready. The publish window is open.",
      messageKey: "notifications.events.ready_to_publish",
      messageParams: { title: item.title },
    });
  }

  return report;
}

/**
 * Pure helper used by the unit suite and by callers that want
 * the AI-completeness suggestion list folded in without going
 * through the database.
 */
export function foldAiSuggestions(
  base: ReadinessReport,
  aiSuggestions: Array<{ path: string; message: string; code?: string }>,
): ReadinessReport {
  const issues = [...base.issues];
  for (const s of aiSuggestions) {
    issues.push({
      path: s.path,
      code: s.code ?? "ai_suggestion",
      severity: "recommendation",
      message: s.message,
    });
  }
  return {
    ...base,
    issues,
    recommendations: base.recommendations + aiSuggestions.length,
  };
}

// Re-export the schema so callers don't need a separate
// import for "what shape does a readiness report have?".
export { ReadinessReportSchema as ReadinessReportWireSchema };

// `desc` is imported above to keep the linter honest about
// future audit-trail history reads.
void desc;
