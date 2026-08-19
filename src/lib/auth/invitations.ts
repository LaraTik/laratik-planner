import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agencyMemberships,
  invitationWorkspaceRoles,
  invitations,
  securityAuditEvents,
  users,
  workspaceMemberships,
  workspaceMembershipRoles,
  workspaces,
} from "@/lib/db/schema";
import { activeAgencyId } from "@/lib/auth/policy";
import { sendEmail } from "@/lib/email";
import { clientEnv, serverEnv } from "@/lib/validation/env";
import { invitationIdentityMatches, normalizeEmailAddress } from "@/lib/auth/invitation-identity";
import { assertCanDeactivateAgencyMember } from "@/lib/auth/member-safety";
import type { InvitationCommand } from "@/lib/auth/invitation-command";
import { enforceRateLimit } from "@/lib/security/rate-limit";

/**
 * Invitation service — per master prompt §13:
 *  - "Never store a raw invitation token. Default expiry is seven days.
 *    Resend invalidates the previous token and updates expiry. Accepting
 *    an invite is idempotent. Only an active Agency Admin may grant
 *    Agency Admin access."
 */

const EXPIRY_DAYS = 7;
const APP_URL = serverEnv.AUTH_URL || clientEnv.NEXT_PUBLIC_APP_URL;

export type InviteInput = InvitationCommand;

function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

/**
 * Create a new invitation. Invalidate any prior pending invitation for
 * the same (agency, email) so the link in the email is the one that works.
 */
export async function createInvitation(
  input: InviteInput & { invitedBy: string },
): Promise<{ id: string; acceptUrl: string; expiresAt: Date }> {
  const agencyId = await activeAgencyId();
  if (!agencyId) throw new Error("Agency not configured");
  const normalizedEmail = normalizeEmailAddress(input.email);

  const { raw, hash } = generateToken();
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const created = await db.transaction(async (tx) => {
    const requestedWorkspaceIds = [
      ...new Set(input.workspaceRoles.map((role) => role.workspaceId)),
    ];
    if (requestedWorkspaceIds.length > 0) {
      const owned = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(
          and(eq(workspaces.agencyId, agencyId), inArray(workspaces.id, requestedWorkspaceIds)),
        );
      if (owned.length !== requestedWorkspaceIds.length) {
        throw new Error("Invalid workspace access selection");
      }
    }

    await tx
      .update(invitations)
      .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(invitations.agencyId, agencyId),
          eq(invitations.email, normalizedEmail),
          eq(invitations.status, "pending"),
        ),
      );

    const [row] = await tx
      .insert(invitations)
      .values({
        agencyId,
        email: normalizedEmail,
        ...(input.inviteeName ? { inviteeName: input.inviteeName } : {}),
        tokenHash: hash,
        expiresAt,
        invitedBy: input.invitedBy,
        grantsAgencyAdmin: input.grantsAgencyAdmin,
      })
      .returning({ id: invitations.id });
    if (!row) throw new Error("Invitation could not be created");

    if (input.workspaceRoles.length > 0) {
      await tx.insert(invitationWorkspaceRoles).values(
        input.workspaceRoles.map((wr) => ({
          invitationId: row.id,
          workspaceId: wr.workspaceId,
          role: wr.role,
        })),
      );
    }
    await tx.insert(securityAuditEvents).values({
      actorId: input.invitedBy,
      action: "invitation_create",
      targetType: "invitation",
      targetId: row.id,
      outcome: "success",
      metadata: {
        workspaceGrantCount: input.workspaceRoles.length,
        grantsAgencyAdmin: input.grantsAgencyAdmin,
      },
    });
    return row;
  });

  const acceptUrl = `${APP_URL}/accept-invitation?token=${raw}`;

  // Best-effort email send (drop if SMTP not configured in dev)
  const sent = await sendEmail({
    to: normalizedEmail,
    subject: `You're invited to laratik-planner`,
    text: `You've been invited to join the agency on laratik-planner.

Accept the invitation: ${acceptUrl}

This link expires on ${expiresAt.toISOString().slice(0, 10)}.`,
  });

  if (sent) {
    await db
      .update(invitations)
      .set({ lastSentAt: new Date() })
      .where(eq(invitations.id, created!.id));
  }

  return { id: created!.id, acceptUrl, expiresAt };
}

/**
 * Accept an invitation by token. Idempotent — re-using a valid token for
 * an already-accepted invite is a no-op that returns the existing membership.
 */
export async function acceptInvitation(input: {
  rawToken: string;
  userId: string;
}): Promise<{ status: "accepted" | "expired" | "invalid"; workspaceIds: string[] }> {
  const limit = await enforceRateLimit({
    scope: "invitation_accept",
    subject: input.rawToken,
    actorId: input.userId,
  });
  if (!limit.allowed) return { status: "invalid", workspaceIds: [] };
  const hash = createHash("sha256").update(input.rawToken).digest("hex");

  return await db.transaction(async (tx) => {
    // Lock the invitation row for the duration of the transaction so two parallel
    // acceptInvitation calls (same token, same user) serialize. The second caller
    // re-reads the row, sees status === "accepted", and returns idempotently
    // without inserting a second workspace_membership, role, or audit event.
    const [inv] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, hash))
      .for("update")
      .limit(1);
    if (!inv) return { status: "invalid", workspaceIds: [] };

    const [acceptingUser] = await tx
      .select({ email: users.email, emailVerifiedAt: users.emailVerified })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (
      !acceptingUser ||
      !invitationIdentityMatches({
        invitedEmail: inv.email,
        signedInEmail: acceptingUser.email,
        emailVerifiedAt: acceptingUser.emailVerifiedAt,
      })
    ) {
      return { status: "invalid", workspaceIds: [] };
    }

    if (inv.status === "revoked") return { status: "invalid", workspaceIds: [] };
    if (inv.status === "accepted") {
      // Idempotent return — list the workspaces the user is now a member of
      const wsIds = await workspaceIdsForInvitationInTx(tx, inv.id);
      return { status: "accepted", workspaceIds: wsIds };
    }
    if (inv.expiresAt.getTime() < Date.now()) {
      await tx
        .update(invitations)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(invitations.id, inv.id));
      return { status: "expired", workspaceIds: [] };
    }

    // Apply the grant
    const grantRoles = await tx
      .select()
      .from(invitationWorkspaceRoles)
      .where(eq(invitationWorkspaceRoles.invitationId, inv.id));

    // Ensure the user has an agency_membership
    await tx
      .insert(agencyMemberships)
      .values({
        agencyId: inv.agencyId,
        userId: input.userId,
        status: "active",
        isAgencyAdmin: inv.grantsAgencyAdmin,
      })
      .onConflictDoUpdate({
        target: [agencyMemberships.agencyId, agencyMemberships.userId],
        set: { status: "active", isAgencyAdmin: inv.grantsAgencyAdmin },
      });

    // Add workspace memberships + roles
    for (const g of grantRoles) {
      const [m] = await tx
        .insert(workspaceMemberships)
        .values({
          workspaceId: g.workspaceId,
          userId: input.userId,
          status: "active",
        })
        .onConflictDoUpdate({
          target: [workspaceMemberships.workspaceId, workspaceMemberships.userId],
          set: { status: "active" },
        })
        .returning({ id: workspaceMemberships.id });

      await tx
        .insert(workspaceMembershipRoles)
        .values({
          workspaceMembershipId: m!.id,
          role: g.role as never,
        })
        .onConflictDoNothing();
    }

    // Mark the invitation accepted
    await tx
      .update(invitations)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
        acceptedBy: input.userId,
        updatedAt: new Date(),
      })
      .where(eq(invitations.id, inv.id));
    await tx.insert(securityAuditEvents).values({
      actorId: input.userId,
      action: "invitation_accept",
      targetType: "invitation",
      targetId: inv.id,
      outcome: "success",
      metadata: { workspaceGrantCount: grantRoles.length },
    });

    return {
      status: "accepted",
      workspaceIds: grantRoles.map((g) => g.workspaceId),
    };
  });
}

async function workspaceIdsForInvitationInTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  invitationId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ workspaceId: invitationWorkspaceRoles.workspaceId })
    .from(invitationWorkspaceRoles)
    .where(eq(invitationWorkspaceRoles.invitationId, invitationId));
  return rows.map((r) => r.workspaceId);
}

/**
 * List active invitations for the agency.
 */
export async function listInvitations() {
  const agencyId = await activeAgencyId();
  if (!agencyId) return [];
  return db
    .select()
    .from(invitations)
    .where(and(eq(invitations.agencyId, agencyId), eq(invitations.status, "pending")))
    .orderBy(sql`${invitations.createdAt} DESC`);
}

/**
 * Resend an invitation — generate a new token + reset expiry, invalidate
 * the old one. Same email.
 */
export async function resendInvitation(invitationId: string, invitedBy: string): Promise<string> {
  const [inv] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.id, invitationId))
    .limit(1);
  if (!inv) throw new Error("Invitation not found");
  if (inv.status !== "pending") throw new Error(`Cannot resend a ${inv.status} invitation`);

  const { raw, hash } = generateToken();
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await db
    .update(invitations)
    .set({ tokenHash: hash, expiresAt, lastSentAt: new Date(), updatedAt: new Date() })
    .where(eq(invitations.id, inv.id));

  const acceptUrl = `${APP_URL}/accept-invitation?token=${raw}`;
  await sendEmail({
    to: inv.email,
    subject: `Reminder: you're invited to laratik-planner`,
    text: `Reminder: you've been invited to join the agency on laratik-planner.

Accept the invitation: ${acceptUrl}

This link expires on ${expiresAt.toISOString().slice(0, 10)}.`,
  });
  void invitedBy;
  return acceptUrl;
}

/**
 * Revoke a pending invitation.
 */
export async function revokeInvitation(invitationId: string) {
  await db
    .update(invitations)
    .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(invitations.id, invitationId));
}

/**
 * Deactivate a user (set is_active=false on workspace_membership + agency_membership).
 * The user's auth account stays (so existing content attribution remains).
 */
export async function deactivateUser(input: {
  actorUserId: string;
  targetUserId: string;
  agencyId: string;
}) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7342892)`);

    const [target] = await tx
      .select({ isAgencyAdmin: agencyMemberships.isAgencyAdmin })
      .from(agencyMemberships)
      .where(
        and(
          eq(agencyMemberships.agencyId, input.agencyId),
          eq(agencyMemberships.userId, input.targetUserId),
          eq(agencyMemberships.status, "active"),
        ),
      )
      .limit(1);
    if (!target) throw new Error("Active agency member not found");

    const [adminCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(agencyMemberships)
      .where(
        and(
          eq(agencyMemberships.agencyId, input.agencyId),
          eq(agencyMemberships.status, "active"),
          eq(agencyMemberships.isAgencyAdmin, true),
        ),
      );

    assertCanDeactivateAgencyMember({
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      targetIsAgencyAdmin: target.isAgencyAdmin,
      activeAgencyAdminCount: adminCount?.count ?? 0,
    });

    await tx
      .update(agencyMemberships)
      .set({ status: "deactivated", deactivatedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(agencyMemberships.agencyId, input.agencyId),
          eq(agencyMemberships.userId, input.targetUserId),
        ),
      );
    await tx
      .update(workspaceMemberships)
      .set({ status: "deactivated", deactivatedAt: new Date() })
      .where(eq(workspaceMemberships.userId, input.targetUserId));
    await tx.insert(securityAuditEvents).values({
      actorId: input.actorUserId,
      action: "member_deactivate",
      targetType: "user",
      targetId: input.targetUserId,
      outcome: "success",
    });
  });
}

/**
 * Reactivate a user.
 */
export async function reactivateUser(input: {
  userId: string;
  agencyId: string;
  actorUserId: string;
}) {
  const workspaceRows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.agencyId, input.agencyId));
  await db
    .update(agencyMemberships)
    .set({ status: "active", deactivatedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(agencyMemberships.agencyId, input.agencyId),
        eq(agencyMemberships.userId, input.userId),
      ),
    );
  if (workspaceRows.length > 0) {
    await db
      .update(workspaceMemberships)
      .set({ status: "active", deactivatedAt: null })
      .where(
        and(
          eq(workspaceMemberships.userId, input.userId),
          inArray(
            workspaceMemberships.workspaceId,
            workspaceRows.map((row) => row.id),
          ),
        ),
      );
  }
  await db.insert(securityAuditEvents).values({
    actorId: input.actorUserId,
    action: "member_reactivate",
    targetType: "user",
    targetId: input.userId,
    outcome: "success",
  });
}

/**
 * All members of the agency (used by User Management UI).
 */
export async function listAgencyMembers() {
  const agencyId = await activeAgencyId();
  if (!agencyId) return [];
  return db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      role: users.role,
      isAgencyAdmin: agencyMemberships.isAgencyAdmin,
      status: agencyMemberships.status,
      joinedAt: agencyMemberships.createdAt,
    })
    .from(agencyMemberships)
    .innerJoin(users, eq(users.id, agencyMemberships.userId))
    .where(eq(agencyMemberships.agencyId, agencyId));
}
