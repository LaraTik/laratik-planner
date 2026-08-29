import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agencyMemberships,
  invitations,
  securityAuditEvents,
  users,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaces,
} from "@/lib/db/schema";
import { generateStrongPassword, hashPassword, isPasswordStrong } from "@/lib/auth/password";
import { normalizeEmailAddress } from "@/lib/auth/invitation-identity";
import { workspaceRoleSchema, type WorkspaceRole } from "@/lib/auth/invitation-command";
import { reserveCapacity } from "@/lib/entitlements";

/**
 * "Add directly" service — creates a `user` row, agency + workspace
 * memberships, and role grants in ONE transaction, with the
 * `must_change_password` flag set so the first-login redirect
 * middleware (see `proxy.ts`) routes the new user to `/set-password`
 * before they can do anything else.
 *
 * The plaintext password is returned to the caller (the
 * `createUserDirectlyAction` server action) for the one-time reveal
 * strip. It is NEVER persisted anywhere except as a bcrypt hash. The
 * security_audit_event records the actor + intent + mustChange flag
 * but never the password.
 *
 * Differentiators from `createInvitation` (lib/auth/invitations.ts):
 *  - Creates the user row EAGERLY (invitation defers to first accept).
 *  - Hashes the password and stamps it onto the row in the same tx.
 *  - Sets `must_change_password = true` so first sign-in is forced to
 *    `/set-password` until the user rotates the admin-supplied password.
 *  - Revokes any pending invitation for the same email — the user can
 *    no longer accept it (the user row already exists) and the
 *    capacity reservation is now backed by the new user.
 *
 * Errors thrown here are *business* errors and are translated by the
 * calling action into a user-facing message; any unexpected DB / SMTP
 * failure is left to bubble (the action wraps `createUserDirectly` in
 * a try/catch and reports to Sentry via `captureError`).
 */

export class UserAlreadyExistsError extends Error {
  constructor(public readonly email: string) {
    super(`A user with the email ${email} already exists.`);
    this.name = "UserAlreadyExistsError";
  }
}

export class ActiveAgencyMemberError extends Error {
  constructor(public readonly email: string) {
    super(`${email} is already an active member of this agency.`);
    this.name = "ActiveAgencyMemberError";
  }
}

export class InvalidPasswordError extends Error {
  constructor() {
    super("Password must be at least 8 characters and contain a letter and a digit.");
    this.name = "InvalidPasswordError";
  }
}

export type CreateUserDirectlyInput = {
  agencyId: string;
  email: string;
  name?: string;
  /** Plaintext — if absent, a strong random one is generated. */
  password?: string;
  grantsAgencyAdmin: boolean;
  /**
   * Multi-role grant shape. Each entry is either the legacy
   * `{ workspaceId, role }` or the new `{ workspaceId, roles: [role, …] }`
   * shape. The service normalises both forms and persists one
   * `workspace_membership_role` row per (workspaceId, role) pair.
   */
  workspaceRoles: ReadonlyArray<
    | { workspaceId: string; role: WorkspaceRole }
    | { workspaceId: string; roles: ReadonlyArray<WorkspaceRole> }
  >;
  /** Default true. The first-login redirect enforces this. */
  mustChangePassword?: boolean;
  createdBy: string;
};

export type CreateUserDirectlyResult = {
  userId: string;
  email: string;
  /** Plaintext — only returned for the one-time reveal strip. */
  tempPassword: string;
  acceptedWorkspaceIds: string[];
};

export async function createUserDirectly(
  input: CreateUserDirectlyInput,
): Promise<CreateUserDirectlyResult> {
  const { agencyId, createdBy } = input;
  if (!agencyId) throw new Error("Agency not configured");
  const normalizedEmail = normalizeEmailAddress(input.email);

  // Pick the password: caller-supplied (validated) or auto-generated.
  const tempPassword = input.password ?? generateStrongPassword();
  if (!isPasswordStrong(tempPassword)) {
    // Defensive: auto-generated passwords always pass; caller-supplied
    // might not if the form validation was bypassed somehow.
    throw new InvalidPasswordError();
  }
  const passwordHash = await hashPassword(tempPassword);

  const result = await db.transaction(async (tx) => {
    // 1. Most specific check first: an active agency member with
    //    this email. This is the more actionable error — the admin
    //    should "Edit access" on the existing member rather than
    //    create a duplicate. We check this BEFORE the global
    //    user-exists check so the error message is specific.
    const [existingMember] = await tx
      .select({ userId: agencyMemberships.userId })
      .from(agencyMemberships)
      .innerJoin(users, eq(users.id, agencyMemberships.userId))
      .where(
        and(
          eq(agencyMemberships.agencyId, agencyId),
          eq(users.email, normalizedEmail),
          eq(agencyMemberships.status, "active"),
        ),
      )
      .limit(1);
    if (existingMember) {
      throw new ActiveAgencyMemberError(normalizedEmail);
    }

    // 2. Email must not already exist as a user. If it does, the
    //    admin should use "Edit access" on the existing member
    //    instead. (OAuth-then-add would be a v2 feature.)
    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    if (existingUser) {
      throw new UserAlreadyExistsError(normalizedEmail);
    }

    // 3. Revoke any pending invitation for this email in the same
    //    agency. The invitee can no longer accept it (the user row
    //    will be created by this transaction). Capacity is released
    //    for the revoked invite — `reserveCapacity` below re-reserves
    //    the slot for the new user.
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

    // 4. Reserve capacity for the new user. Same `users` resource
    //    key as the invitation flow so the two are mutually visible
    //    on the plan's "users" meter.
    await reserveCapacity(tx, agencyId, [{ resource: "users", increase: 1 }]);

    // 5. Validate every requested workspace belongs to the agency
    //    and every role is a valid enum value. Same contract as
    //    `createInvitation` (mirrored here to keep the action layer
    //    free of business validation). The command shape can carry
    //    multiple roles per workspace; flatten before validating
    //    each row.
    const flatGrants: { workspaceId: string; role: WorkspaceRole }[] = [];
    for (const g of input.workspaceRoles) {
      if ("role" in g) {
        flatGrants.push({ workspaceId: g.workspaceId, role: g.role });
      } else {
        for (const role of g.roles) {
          flatGrants.push({ workspaceId: g.workspaceId, role });
        }
      }
    }
    const requestedWorkspaceIds = Array.from(new Set(flatGrants.map((r) => r.workspaceId)));
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
    for (const { role } of flatGrants) {
      if (!workspaceRoleSchema.safeParse(role).success) {
        throw new Error("Invalid workspace access selection");
      }
    }

    // 6. Insert the user row. `emailVerified` is stamped on creation
    //    because the admin has hand-verified the email out-of-band;
    //    skipping the stamp would make this user fail the
    //    `invitationIdentityMatches` check on subsequent invites.
    //    `displayName` is set explicitly (the schema's before-insert
    //    trigger would fill it from `name` / email local-part, but
    //    Drizzle's type system requires it on the INSERT shape).
    const mustChange = input.mustChangePassword !== false;
    const emailLocalPart = normalizedEmail.split("@")[0] ?? normalizedEmail;
    const [userRow] = await tx
      .insert(users)
      .values({
        email: normalizedEmail,
        displayName: input.name ?? emailLocalPart,
        ...(input.name ? { name: input.name } : {}),
        passwordHash,
        mustChangePassword: mustChange,
        emailVerified: new Date(),
      })
      .returning({ id: users.id });
    if (!userRow) throw new Error("User could not be created");

    // 7. Insert the agency_membership.
    await tx.insert(agencyMemberships).values({
      agencyId,
      userId: userRow.id,
      status: "active",
      isAgencyAdmin: input.grantsAgencyAdmin,
    });

    // 8. Insert workspace_memberships + role rows. Multiple roles in
    //    the same workspace are stored as separate rows in
    //    `workspace_membership_role`; the membership row itself is
    //    upserted on `(workspaceId, userId)` so re-inserting is a
    //    no-op for the first role and a status-only update for any
    //    subsequent role in the same workspace.
    const acceptedWorkspaceIds: string[] = [];
    for (const { workspaceId, role } of flatGrants) {
      const [m] = await tx
        .insert(workspaceMemberships)
        .values({
          workspaceId,
          userId: userRow.id,
          status: "active",
        })
        .onConflictDoUpdate({
          target: [workspaceMemberships.workspaceId, workspaceMemberships.userId],
          set: { status: "active", deactivatedAt: null },
        })
        .returning({ id: workspaceMemberships.id });
      if (!m) continue;
      await tx
        .insert(workspaceMembershipRoles)
        .values({
          workspaceMembershipId: m.id,
          role: role as never,
        })
        .onConflictDoNothing();
      acceptedWorkspaceIds.push(workspaceId);
    }

    // 9. Audit event. `source: "admin_direct"` distinguishes this
    //    path from the invitation flow (whose event is
    //    `action: "invitation_create"`). The plaintext password is
    //    never recorded; only the actor + intent + the must-change
    //    flag (so an auditor can confirm force-change was set).
    await tx.insert(securityAuditEvents).values({
      actorId: createdBy,
      action: "user_create",
      targetType: "user",
      targetId: userRow.id,
      outcome: "success",
      metadata: {
        agencyId,
        source: "admin_direct",
        grantsAgencyAdmin: input.grantsAgencyAdmin,
        workspaceGrantCount: flatGrants.length,
        mustChangePassword: mustChange,
      },
    });

    return {
      userId: userRow.id,
      email: normalizedEmail,
      acceptedWorkspaceIds,
    };
  });

  return {
    ...result,
    tempPassword,
  };
}
