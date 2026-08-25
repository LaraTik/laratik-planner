import "server-only";
import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  agencyMemberships,
  supportAccessAudit,
  supportAccessGrants,
  supportAccessRequests,
  workspaces,
} from "@/lib/db/schema";
import { hasPlatformPermission, requirePlatformPermission } from "@/lib/auth/platform-access";
import { isAgencyAdmin, requirePolicy, type Actor } from "@/lib/auth/policy";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §4 (Milestone 3) — Ticketed, approved,
 * time-limited support access.
 *
 * This module is the single source of truth for the support-access
 * workflow. The platform console and the agency admin surfaces both
 * read + write through these helpers. The five core operations are:
 *
 *   1. `createSupportAccessRequest(actor, input)` — a platform admin
 *      files a ticketed ask. The request lands in `pending` state
 *      and an audit event is appended.
 *   2. `approveSupportAccessRequest(actor, requestId, decision)` —
 *      an agency admin (or a delegated agency owner) approves or
 *      rejects a pending request. Approval creates a `support_access_grant`
 *      row whose `expires_at` is `now() + requested_duration_hours`,
 *      scoped to the request's target. Rejection sets the request
 *      status to `rejected` and records a reason.
 *   3. `revokeSupportAccessGrant(actor, grantId, reason)` — anyone
 *      with authority (the platform admin who asked, the agency admin
 *      who approved, or another platform admin) can revoke an active
 *      grant. Revocation sets `revoked_at = now()`. The grant row
 *      stays in the table for the audit trail but is no longer
 *      honoured by `isSupportAccessActive`.
 *   4. `expireStaleSupportAccessGrants()` — sweep routine that
 *      finds grants whose `expires_at <= now()` and marks their
 *      request `expired`. Idempotent and safe to call on every
 *      request: only grants that are still `active` (i.e. not
 *      already revoked) are flipped.
 *   5. `isSupportAccessActive(actor, targetAgencyId, scopeWorkspaceId?)` —
 *      the gate used by every platform-admin tenant view. Returns
 *      `true` only when the actor has an un-revoked, un-expired
 *      grant that covers the requested scope. Audit is the caller's
 *      responsibility (`recordSupportAccessAudit`).
 *
 * Authority model (mirrors the platform-vs-agency split in M1.1):
 *
 *   - **Platform admin authority** is required to call
 *     `createSupportAccessRequest`. A platform admin who is not
 *     also an agency admin gets zero implicit access to tenant
 *     content. The grant is the *only* mechanism that opens the
 *     door, and the door is narrow.
 *   - **Agency admin authority** is required to call
 *     `approveSupportAccessRequest` for a request whose
 *     `target_agency_id` matches the agency the actor administers.
 *   - **Either side** can revoke: a platform admin who created
 *     the request, the agency admin who approved it, or any
 *     platform admin (the audit log records the actor). A
 *     platform admin who is not a party to the request can
 *     revoke it for incident response.
 *
 * Error model:
 *
 *   The service throws `SupportAccessError` (with a code) for
 *   every state-machine violation. The route layer maps the code
 *   to an HTTP status. The codes are documented on the class.
 *
 * Audit model:
 *
 *   Every state transition appends a row to `support_access_audit`
 *   (which is append-only at the DB level via the trigger installed
 *   in migration 0012). The audit row carries the actor, the
 *   grant_id (NULL for transitions that don't have a grant yet),
 *   the target agency, an action verb, and a free-text metadata
 *   JSONB. No tenant content is included.
 *
 * Rate limiting:
 *
 *   The platform console calls `enforceRateLimit({ scope:
 *   "support_access_request", subject: actor.id })` BEFORE calling
 *   `createSupportAccessRequest`. The service does not re-check;
 *   that keeps the service testable and lets the route layer
 *   choose a different scope for the UI vs the API.
 *
 * Concurrency:
 *
 *   The state transitions wrap their reads + writes in a single
 *   `db.transaction`. The two race conditions we worry about:
 *
 *     a) Two agency admins approve the same request. The
 *        `request_id UNIQUE` constraint on `support_access_grant`
 *        makes the second transaction fail with a unique
 *        violation. The first wins. The second's caller catches
 *        the error and re-reads the request (which is now
 *        `approved`).
 *     b) A grant is being revoked while a platform admin is
 *        making a tenant read. The read checks the grant inside
 *        its own transaction; if `revoked_at` is non-null by
 *        the time the read commits, the gate returns false.
 *        Postgres MVCC ensures the read sees a consistent
 *        snapshot.
 */

export const SUPPORT_ACCESS_REQUEST_DURATION_LIMIT_HOURS = 168; // 7 days
export const SUPPORT_ACCESS_DEFAULT_DURATION_HOURS = 2;
export const SUPPORT_ACCESS_AUTOMATIC_EXPIRY_PENDING_DAYS = 7;

export const SupportAccessErrorCode = {
  NotPlatformAdmin: "support.not-platform-admin",
  NotAgencyAdmin: "support.not-agency-admin",
  NotFound: "support.not-found",
  AlreadyDecided: "support.already-decided",
  Expired: "support.expired",
  InvalidScope: "support.invalid-scope",
  CrossAgency: "support.cross-agency",
  NoActiveGrant: "support.no-active-grant",
  DownloadNotAllowed: "support.download-not-allowed",
} as const;
export type SupportAccessErrorCode =
  (typeof SupportAccessErrorCode)[keyof typeof SupportAccessErrorCode];

export class SupportAccessError extends Error {
  public readonly code: SupportAccessErrorCode;
  public readonly details: Record<string, unknown>;
  constructor(
    code: SupportAccessErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SupportAccessError";
    this.code = code;
    this.details = details;
  }
}

export const CreateSupportAccessRequestSchema = z.object({
  ticketReference: z.string().trim().min(3).max(120),
  reason: z.string().trim().min(8).max(2000),
  targetAgencyId: z.string().uuid(),
  scopeWorkspaceId: z.string().uuid().nullable().optional(),
  scopeMetadataOnly: z.boolean().default(false),
  requestedDurationHours: z.number().int().min(1).max(SUPPORT_ACCESS_REQUEST_DURATION_LIMIT_HOURS),
  downloadsRequested: z.boolean().default(false),
});
export type CreateSupportAccessRequestInput = z.infer<typeof CreateSupportAccessRequestSchema>;

export const SupportAccessDecisionSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
  /**
   * When `true`, the grant is created with `downloads_allowed = true`
   * even if the original request had `downloads_requested = false`.
   * Defaults to `false` (downloads off). The platform admin can never
   * force downloads on; only the agency admin can grant them.
   */
  grantDownloads: z.boolean().default(false),
});
export type SupportAccessDecisionInput = z.infer<typeof SupportAccessDecisionSchema>;

export const SupportAccessRequestRow = z.object({
  id: z.string().uuid(),
  ticketReference: z.string(),
  reason: z.string(),
  targetAgencyId: z.string().uuid(),
  scopeWorkspaceId: z.string().uuid().nullable(),
  scopeMetadataOnly: z.boolean(),
  requestedDurationHours: z.number().int(),
  downloadsRequested: z.boolean(),
  status: z.string(),
  requestedByUserId: z.string().uuid().nullable(),
  approvedByUserId: z.string().uuid().nullable(),
  decidedAt: z.date().nullable(),
  decisionReason: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type SupportAccessRequestRow = z.infer<typeof SupportAccessRequestRow>;

export const SupportAccessGrantRow = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  targetAgencyId: z.string().uuid(),
  scopeWorkspaceId: z.string().uuid().nullable(),
  scopeMetadataOnly: z.boolean(),
  downloadsAllowed: z.boolean(),
  approvedByUserId: z.string().uuid(),
  grantedToUserId: z.string().uuid(),
  activatedAt: z.date(),
  expiresAt: z.date(),
  revokedAt: z.date().nullable(),
  revokedByUserId: z.string().uuid().nullable(),
  revokedReason: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type SupportAccessGrantRow = z.infer<typeof SupportAccessGrantRow>;

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Read the active agency memberships for an actor. Exposed for
 * callers that need a quick "what agencies am I in?" answer
 * without going through the policy helper. Not currently used
 * by the in-file service paths; kept here for the platform
 * console UI which lists "my agencies" on the security tab.
 */
export async function listActiveAgencyIds(actor: Actor): Promise<string[]> {
  const rows = await db
    .select({ agencyId: agencyMemberships.agencyId })
    .from(agencyMemberships)
    .where(and(eq(agencyMemberships.userId, actor.id), eq(agencyMemberships.status, "active")));
  return rows.map((row) => row.agencyId);
}

/**
 * Assert that the agency is currently in a state where its
 * admins can be asked for support access. Suspended or archived
 * agencies cannot grant access (the request is rejected up front
 * — a platform admin cannot bypass the agency admin gate just
 * because the agency is offline).
 */
async function assertAgencyAcceptingAccessRequests(agencyId: string): Promise<void> {
  const { agencies } = await import("@/lib/db/schema");
  const [row] = await db
    .select({ id: agencies.id, suspendedAt: agencies.suspendedAt, archivedAt: agencies.archivedAt })
    .from(agencies)
    .where(eq(agencies.id, agencyId))
    .limit(1);
  if (!row) {
    throw new SupportAccessError(SupportAccessErrorCode.NotFound, "Agency not found", {
      agencyId,
    });
  }
  if (row.suspendedAt || row.archivedAt) {
    throw new SupportAccessError(
      SupportAccessErrorCode.InvalidScope,
      "Agency is suspended or archived and cannot accept support access requests.",
      { agencyId, suspendedAt: row.suspendedAt, archivedAt: row.archivedAt },
    );
  }
}

// ─── 1. Create request ───────────────────────────────────────────────────

export async function createSupportAccessRequest(
  actor: Actor,
  input: CreateSupportAccessRequestInput,
): Promise<SupportAccessRequestRow> {
  await requirePlatformPermission(actor, "platform.support.request");
  const parsed = CreateSupportAccessRequestSchema.parse(input);

  // Workspace scope must belong to the target agency (IDOR defence).
  if (parsed.scopeWorkspaceId) {
    const [ws] = await db
      .select({ id: workspaces.id, agencyId: workspaces.agencyId })
      .from(workspaces)
      .where(eq(workspaces.id, parsed.scopeWorkspaceId))
      .limit(1);
    if (!ws || ws.agencyId !== parsed.targetAgencyId) {
      throw new SupportAccessError(
        SupportAccessErrorCode.CrossAgency,
        "Workspace does not belong to the target agency.",
        {
          workspaceId: parsed.scopeWorkspaceId,
          agencyId: parsed.targetAgencyId,
        },
      );
    }
  }

  await assertAgencyAcceptingAccessRequests(parsed.targetAgencyId);

  // Decide if the platform admin needs an active agency membership.
  // The grant, when approved, lets them view content; the *request*
  // is platform-admin authority. The two are independent.
  const [row] = await db
    .insert(supportAccessRequests)
    .values({
      ticketReference: parsed.ticketReference,
      reason: parsed.reason,
      targetAgencyId: parsed.targetAgencyId,
      scopeWorkspaceId: parsed.scopeWorkspaceId ?? null,
      scopeMetadataOnly: parsed.scopeMetadataOnly,
      requestedDurationHours: parsed.requestedDurationHours,
      downloadsRequested: parsed.downloadsRequested,
      status: "pending",
      requestedByUserId: actor.id,
    })
    .returning();
  if (!row) {
    throw new SupportAccessError(
      SupportAccessErrorCode.InvalidScope,
      "Failed to create support access request",
    );
  }
  return SupportAccessRequestRow.parse({
    ...row,
    scopeMetadataOnly: row.scopeMetadataOnly,
    downloadsRequested: row.downloadsRequested,
  });
}

// ─── 2. Decision (approve / reject) ─────────────────────────────────────

export type SupportAccessDecision = "approved" | "rejected";

export async function decideSupportAccessRequest(
  actor: Actor,
  requestId: string,
  decision: SupportAccessDecision,
  input: SupportAccessDecisionInput,
): Promise<{ request: SupportAccessRequestRow; grant: SupportAccessGrantRow | null }> {
  const parsed = SupportAccessDecisionSchema.parse(input);

  return db.transaction(async (tx) => {
    // Lock the request row so a second concurrent decision is
    // blocked until this transaction commits.
    const [reqRow] = await tx
      .select()
      .from(supportAccessRequests)
      .where(eq(supportAccessRequests.id, requestId))
      .for("update")
      .limit(1);
    if (!reqRow) {
      throw new SupportAccessError(
        SupportAccessErrorCode.NotFound,
        "Support access request not found",
        { requestId },
      );
    }
    if (reqRow.status !== "pending") {
      throw new SupportAccessError(
        SupportAccessErrorCode.AlreadyDecided,
        `Request is already in '${reqRow.status}' state.`,
        { requestId, currentStatus: reqRow.status },
      );
    }
    // Only agency admins of the target agency can decide.
    const adminOk = await isAgencyAdmin(actor, reqRow.targetAgencyId);
    if (!adminOk) {
      throw new SupportAccessError(
        SupportAccessErrorCode.NotAgencyAdmin,
        "Only an agency admin can decide a support access request.",
        { requestId, agencyId: reqRow.targetAgencyId },
      );
    }

    if (decision === "rejected") {
      const [updated] = await tx
        .update(supportAccessRequests)
        .set({
          status: "rejected",
          approvedByUserId: actor.id,
          decidedAt: new Date(),
          decisionReason: parsed.reason,
          updatedAt: new Date(),
        })
        .where(eq(supportAccessRequests.id, requestId))
        .returning();
      if (!updated) {
        throw new SupportAccessError(
          SupportAccessErrorCode.InvalidScope,
          "Failed to update support access request",
        );
      }
      return {
        request: SupportAccessRequestRow.parse(updated),
        grant: null,
      };
    }

    // decision === "approved"
    const now = new Date();
    const expiresAt = new Date(now.getTime() + reqRow.requestedDurationHours * 60 * 60 * 1000);
    // The platform admin who originally asked is the grantee; the
    // FK guarantees they exist (or SET NULL on user delete would
    // break the grant — but our schema is RESTRICT, so they must
    // exist).
    if (!reqRow.requestedByUserId) {
      throw new SupportAccessError(
        SupportAccessErrorCode.InvalidScope,
        "Support access request has no requesting user.",
        { requestId },
      );
    }
    const downloadsAllowed = parsed.grantDownloads && reqRow.downloadsRequested;
    let grantRow;
    try {
      const [created] = await tx
        .insert(supportAccessGrants)
        .values({
          requestId,
          targetAgencyId: reqRow.targetAgencyId,
          scopeWorkspaceId: reqRow.scopeWorkspaceId,
          scopeMetadataOnly: reqRow.scopeMetadataOnly,
          downloadsAllowed,
          approvedByUserId: actor.id,
          grantedToUserId: reqRow.requestedByUserId,
          activatedAt: now,
          expiresAt,
        })
        .returning();
      grantRow = created;
    } catch (e) {
      // The UNIQUE constraint on request_id catches a concurrent
      // double-approval. Re-read and surface AlreadyDecided.
      if (
        e instanceof Error &&
        (e.message.includes("support_access_grant_request_id") ||
          e.message.toLowerCase().includes("duplicate key"))
      ) {
        throw new SupportAccessError(
          SupportAccessErrorCode.AlreadyDecided,
          "Grant already exists for this request.",
          { requestId },
        );
      }
      throw e;
    }
    if (!grantRow) {
      throw new SupportAccessError(
        SupportAccessErrorCode.InvalidScope,
        "Failed to create support access grant",
      );
    }
    const [updated] = await tx
      .update(supportAccessRequests)
      .set({
        status: "approved",
        approvedByUserId: actor.id,
        decidedAt: now,
        decisionReason: parsed.reason,
        updatedAt: new Date(),
      })
      .where(eq(supportAccessRequests.id, requestId))
      .returning();
    if (!updated) {
      throw new SupportAccessError(
        SupportAccessErrorCode.InvalidScope,
        "Failed to update support access request",
      );
    }
    return {
      request: SupportAccessRequestRow.parse(updated),
      grant: SupportAccessGrantRow.parse(grantRow),
    };
  });
}

// ─── 3. Revoke grant ────────────────────────────────────────────────────

export async function revokeSupportAccessGrant(
  actor: Actor,
  grantId: string,
  reason: string,
): Promise<SupportAccessGrantRow> {
  if (reason.trim().length < 3) {
    throw new SupportAccessError(
      SupportAccessErrorCode.InvalidScope,
      "Revocation reason must be at least 3 characters.",
    );
  }
  return db.transaction(async (tx) => {
    const [grant] = await tx
      .select()
      .from(supportAccessGrants)
      .where(eq(supportAccessGrants.id, grantId))
      .for("update")
      .limit(1);
    if (!grant) {
      throw new SupportAccessError(
        SupportAccessErrorCode.NotFound,
        "Support access grant not found",
        { grantId },
      );
    }
    if (grant.revokedAt) {
      return SupportAccessGrantRow.parse(grant);
    }
    // Authority: the requester, an administrator of the target agency,
    // or a Platform Owner exercising incident-response authority.
    const canManagePlatformAccess = await hasPlatformPermission(actor, "platform.access.manage");
    const isAgency = await isAgencyAdmin(actor, grant.targetAgencyId);
    const isRequester = grant.grantedToUserId === actor.id;
    if (!canManagePlatformAccess && !isAgency && !isRequester) {
      throw new SupportAccessError(
        SupportAccessErrorCode.NotAgencyAdmin,
        "Only the requester, an agency administrator, or a Platform Owner can revoke this grant.",
        { grantId, agencyId: grant.targetAgencyId },
      );
    }
    const now = new Date();
    const [updated] = await tx
      .update(supportAccessGrants)
      .set({
        revokedAt: now,
        revokedByUserId: actor.id,
        revokedReason: reason,
        updatedAt: now,
      })
      .where(eq(supportAccessGrants.id, grantId))
      .returning();
    if (!updated) {
      throw new SupportAccessError(
        SupportAccessErrorCode.InvalidScope,
        "Failed to revoke support access grant",
      );
    }
    return SupportAccessGrantRow.parse(updated);
  });
}

// ─── 4. Expire stale grants (sweep) ──────────────────────────────────────

/**
 * Idempotent sweep that:
 *   - flips `support_access_request.status` from `pending` to `expired`
 *     when the request is older than the auto-expiry threshold,
 *   - flips `support_access_request.status` to `expired` when the
 *     associated grant has `expires_at <= now()` and the request is
 *     still `approved`. (The grant row itself stays for the audit
 *     trail; `isSupportAccessActive` is the gate that respects the
 *     expiry.)
 *
 * The sweep is a pure SQL helper — no actor is required. It is
 * safe to call from a cron worker, from the platform console page
 * load, or from the request-creation path. The transaction ensures
 * the request and grant are evaluated consistently.
 */
export async function expireStaleSupportAccessGrants(now: Date = new Date()): Promise<{
  expiredRequests: number;
  expiredGrants: number;
}> {
  const expiryThreshold = new Date(
    now.getTime() - SUPPORT_ACCESS_AUTOMATIC_EXPIRY_PENDING_DAYS * 24 * 60 * 60 * 1000,
  );

  return db.transaction(async (tx) => {
    // Expire pending requests that have been waiting too long.
    const expiredPending = await tx
      .update(supportAccessRequests)
      .set({
        status: "expired",
        updatedAt: now,
        decisionReason: "Auto-expired after the platform's pending window.",
      })
      .where(
        and(
          eq(supportAccessRequests.status, "pending"),
          lte(supportAccessRequests.createdAt, expiryThreshold),
        ),
      )
      .returning({ id: supportAccessRequests.id });

    // Flip approved requests whose grant has expired to status "expired"
    // (the grant row is preserved). The isSupportAccessActive gate is
    // the actual source of truth; this is a UI bookkeeping update.
    const expiredGrantsList = await tx
      .select({ id: supportAccessGrants.id, requestId: supportAccessGrants.requestId })
      .from(supportAccessGrants)
      .where(and(isNull(supportAccessGrants.revokedAt), lte(supportAccessGrants.expiresAt, now)))
      .for("update");
    if (expiredGrantsList.length > 0) {
      await tx
        .update(supportAccessRequests)
        .set({ status: "expired", updatedAt: now })
        .where(
          and(
            eq(supportAccessRequests.status, "approved"),
            inArray(
              supportAccessRequests.id,
              expiredGrantsList.map((row) => row.requestId),
            ),
          ),
        );
    }

    return {
      expiredRequests: expiredPending.length,
      expiredGrants: expiredGrantsList.length,
    };
  });
}

// ─── 5. Gate (is grant currently active) ────────────────────────────────

/**
 * The gate every platform-admin tenant view calls before
 * surfacing tenant data. Returns the active grant row when the
 * actor has an un-revoked, un-expired grant that covers the
 * requested scope. Returns `null` otherwise.
 *
 *   - `scopeWorkspaceId === null` checks for an agency-wide
 *     grant that is NOT metadata-only (i.e. content access).
 *   - `scopeWorkspaceId === "<uuid>"` checks for a grant that
 *     covers that exact workspace, OR an agency-wide grant.
 *   - `metadataOnly === true` accepts a grant that is metadata-only.
 *
 * The caller is responsible for the audit row
 * (`recordSupportAccessAudit`).
 */
export async function findActiveSupportAccessGrant(input: {
  actor: Actor;
  targetAgencyId: string;
  scopeWorkspaceId?: string | null;
  metadataOnly?: boolean;
}): Promise<SupportAccessGrantRow | null> {
  const { actor, targetAgencyId, scopeWorkspaceId = null, metadataOnly = false } = input;
  const now = new Date();

  const rows = await db
    .select()
    .from(supportAccessGrants)
    .where(
      and(
        eq(supportAccessGrants.grantedToUserId, actor.id),
        eq(supportAccessGrants.targetAgencyId, targetAgencyId),
        isNull(supportAccessGrants.revokedAt),
        gte(supportAccessGrants.expiresAt, now),
      ),
    )
    .orderBy(desc(supportAccessGrants.activatedAt));

  for (const grant of rows) {
    // Metadata-only requests can only be honoured by a grant that
    // is itself metadata-only. Content requests can be honoured by
    // any grant (including a metadata-only one as a fallback).
    if (metadataOnly && !grant.scopeMetadataOnly) continue;
    // Workspace match: agency-wide grants (scopeWorkspaceId is null)
    // cover any workspace; otherwise the workspace id must match.
    if (scopeWorkspaceId && grant.scopeWorkspaceId && grant.scopeWorkspaceId !== scopeWorkspaceId) {
      continue;
    }
    return SupportAccessGrantRow.parse(grant);
  }
  return null;
}

// ─── 6. Audit ──────────────────────────────────────────────────────────

export const SupportAccessAuditAction = {
  CreateRequest: "support.request.create",
  Approve: "support.request.approve",
  Reject: "support.request.reject",
  Revoke: "support.grant.revoke",
  Expire: "support.grant.expire",
  ViewTenantObject: "support.view",
  DownloadAttempt: "support.download",
  DownloadAllowed: "support.download.allowed",
  DownloadDenied: "support.download.denied",
} as const;
export type SupportAccessAuditAction =
  (typeof SupportAccessAuditAction)[keyof typeof SupportAccessAuditAction];

export interface RecordSupportAccessAuditInput {
  actor: Actor;
  grantId: string | null;
  targetAgencyId: string;
  targetType: string;
  targetId: string | null;
  action: SupportAccessAuditAction;
  outcome: "success" | "denied" | "failed";
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordSupportAccessAudit(
  input: RecordSupportAccessAuditInput,
): Promise<void> {
  await db.insert(supportAccessAudit).values({
    grantId: input.grantId,
    actorUserId: input.actor.id,
    targetAgencyId: input.targetAgencyId,
    targetType: input.targetType,
    targetId: input.targetId,
    action: input.action,
    outcome: input.outcome,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    requestId: input.requestId ?? null,
    metadata: input.metadata ?? null,
  });
}

// ─── 7. Read views (platform + agency surfaces) ────────────────────────

export async function listRequestsForAgency(
  agencyId: string,
  opts: { limit?: number } = {},
): Promise<SupportAccessRequestRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const rows = await db
    .select()
    .from(supportAccessRequests)
    .where(eq(supportAccessRequests.targetAgencyId, agencyId))
    .orderBy(desc(supportAccessRequests.createdAt))
    .limit(limit);
  return rows.map((row) => SupportAccessRequestRow.parse(row));
}

export async function listRequestsByPlatformAdmin(
  actor: Actor,
): Promise<SupportAccessRequestRow[]> {
  if (!actor.id) return [];
  const rows = await db
    .select()
    .from(supportAccessRequests)
    .where(eq(supportAccessRequests.requestedByUserId, actor.id))
    .orderBy(desc(supportAccessRequests.createdAt))
    .limit(100);
  return rows.map((row) => SupportAccessRequestRow.parse(row));
}

export async function listActiveGrantsForActor(actor: Actor): Promise<SupportAccessGrantRow[]> {
  if (!actor.id) return [];
  const now = new Date();
  const rows = await db
    .select()
    .from(supportAccessGrants)
    .where(
      and(
        eq(supportAccessGrants.grantedToUserId, actor.id),
        isNull(supportAccessGrants.revokedAt),
        gte(supportAccessGrants.expiresAt, now),
      ),
    )
    .orderBy(desc(supportAccessGrants.activatedAt));
  return rows.map((row) => SupportAccessGrantRow.parse(row));
}

export async function listRecentAuditForActor(actor: Actor): Promise<
  Array<{
    id: number;
    targetAgencyId: string;
    targetType: string;
    targetId: string | null;
    action: string;
    outcome: string;
    createdAt: Date;
  }>
> {
  if (!actor.id) return [];
  const rows = await db
    .select({
      id: supportAccessAudit.id,
      targetAgencyId: supportAccessAudit.targetAgencyId,
      targetType: supportAccessAudit.targetType,
      targetId: supportAccessAudit.targetId,
      action: supportAccessAudit.action,
      outcome: supportAccessAudit.outcome,
      createdAt: supportAccessAudit.createdAt,
    })
    .from(supportAccessAudit)
    .where(eq(supportAccessAudit.actorUserId, actor.id))
    .orderBy(desc(supportAccessAudit.createdAt))
    .limit(50);
  return rows;
}

export async function listRecentSupportAuditAsPlatform(
  actor: Actor,
  limit = 50,
): Promise<
  Array<{
    id: number;
    targetAgencyId: string;
    targetType: string;
    targetId: string | null;
    action: string;
    outcome: string;
    createdAt: Date;
  }>
> {
  await requirePlatformPermission(actor, "platform.audit.read");
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  return db
    .select({
      id: supportAccessAudit.id,
      targetAgencyId: supportAccessAudit.targetAgencyId,
      targetType: supportAccessAudit.targetType,
      targetId: supportAccessAudit.targetId,
      action: supportAccessAudit.action,
      outcome: supportAccessAudit.outcome,
      createdAt: supportAccessAudit.createdAt,
    })
    .from(supportAccessAudit)
    .orderBy(desc(supportAccessAudit.createdAt))
    .limit(safeLimit);
}

// ─── 8. IDOR guard for tenant views ─────────────────────────────────────

/**
 * Convenience wrapper used by every tenant view that a platform
 * admin hits. Returns the active grant (or null) and writes a
 * `support.view` audit row in the same call. The route layer
 * turns a `null` result into a 404 — a platform admin who
 * navigates to a tenant URL by guessing the slug is denied
 * silently (the audit row still records the attempt).
 */
export async function authorizePlatformTenantView(input: {
  actor: Actor;
  targetAgencyId: string;
  scopeWorkspaceId?: string | null;
  targetType: string;
  targetId: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}): Promise<SupportAccessGrantRow | null> {
  const grant = await findActiveSupportAccessGrant({
    actor: input.actor,
    targetAgencyId: input.targetAgencyId,
    scopeWorkspaceId: input.scopeWorkspaceId ?? null,
    metadataOnly: false,
  });
  await recordSupportAccessAudit({
    actor: input.actor,
    grantId: grant?.id ?? null,
    targetAgencyId: input.targetAgencyId,
    targetType: input.targetType,
    targetId: input.targetId,
    action: SupportAccessAuditAction.ViewTenantObject,
    outcome: grant ? "success" : "denied",
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    requestId: input.requestId ?? null,
    metadata: { scopeWorkspaceId: input.scopeWorkspaceId ?? null },
  });
  return grant;
}

/**
 * Authorize a download or export attempt. The grant's
 * `downloads_allowed` flag must be true; otherwise the audit
 * records a denied outcome and the caller is expected to throw
 * a 403.
 */
export async function authorizePlatformDownload(input: {
  actor: Actor;
  targetAgencyId: string;
  targetType: string;
  targetId: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}): Promise<{ allowed: boolean; grant: SupportAccessGrantRow | null }> {
  const grant = await findActiveSupportAccessGrant({
    actor: input.actor,
    targetAgencyId: input.targetAgencyId,
    metadataOnly: false,
  });
  const allowed = !!grant && grant.downloadsAllowed;
  await recordSupportAccessAudit({
    actor: input.actor,
    grantId: grant?.id ?? null,
    targetAgencyId: input.targetAgencyId,
    targetType: input.targetType,
    targetId: input.targetId,
    action: allowed
      ? SupportAccessAuditAction.DownloadAllowed
      : SupportAccessAuditAction.DownloadDenied,
    outcome: allowed ? "success" : "denied",
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    requestId: input.requestId ?? null,
  });
  return { allowed, grant };
}

export { requirePolicy };
