"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin, PermissionDeniedError } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { assertCanDemoteAgencyAdmin } from "@/lib/auth/member-safety";
import {
  agencyMemberships,
  securityAuditEvents,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaces,
} from "@/lib/db/schema";
import { db } from "@/lib/db";
import {
  createInvitation,
  deactivateUser,
  reactivateUser,
  resendInvitation,
  revokeInvitation,
} from "@/lib/auth/invitations";
import { invitationCommandSchema, workspaceRoleSchema } from "@/lib/auth/invitation-command";
import { userCreateCommandSchema } from "@/lib/auth/user-create-command";
import {
  ActiveAgencyMemberError,
  InvalidPasswordError,
  UserAlreadyExistsError,
  createUserDirectly,
} from "@/lib/auth/user-creation";
import { enforceRateLimit, rateLimitRuleFor } from "@/lib/security/rate-limit";
import { captureError } from "@/lib/observability/sentry";

export type InviteActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
  invitationId?: string;
  expiresAt?: string;
  devLink?: string | null;
};

/**
 * Result shape for the per-invitation actions (resend, revoke).
 *
 * Both actions are wired into a React `useTransition` in the client —
 * they MUST never throw, because an unhandled rejection from a
 * server action inside a transition replaces the whole page with the
 * error boundary (the "We hit an error rendering this page" screen)
 * instead of just surfacing the failure to the user. They translate
 * every business / infrastructure failure into an `{ error }` shape;
 * the client renders the message inline.
 */
export type InvitationActionState = { error?: string; success?: boolean };

function formatRateLimitRetry(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.round(seconds / 3600);
    return `Too many invitations. Try again in ${hours} hour${hours === 1 ? "" : "s"}.`;
  }
  if (seconds >= 60) {
    const minutes = Math.round(seconds / 60);
    return `Too many invitations. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  return `Too many invitations. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
}

function formatZodIssues(issues: { path: (string | number)[]; message: string }[]): {
  error: string;
  fieldErrors: Record<string, string[]>;
} {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
    if (!fieldErrors[key]) fieldErrors[key] = [];
    fieldErrors[key].push(issue.message);
  }
  const error = issues.map((i) => `${i.path.join(".") || "form"}: ${i.message}`).join("; ");
  return { error, fieldErrors };
}

export async function sendInviteAction(
  _prev: InviteActionState | undefined,
  formData: FormData,
): Promise<InviteActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in. Please sign in again." };
  const actor = await currentActor();
  if (!actor) return { error: "Not signed in. Please sign in again." };
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) return { error: "Agency not configured. Contact the platform admin." };
  if (!(await isAgencyAdmin(actor, agencyId))) {
    return { error: "Only agency administrators can send invitations." };
  }

  let workspaceRoles: unknown = [];
  try {
    const raw = formData.get("workspaceRoles");
    workspaceRoles = typeof raw === "string" && raw ? JSON.parse(raw) : [];
  } catch {
    return {
      error: "Invalid workspace access selection.",
      fieldErrors: { workspaceRoles: ["Invalid JSON"] },
    };
  }

  const parsed = invitationCommandSchema.safeParse({
    email: formData.get("email"),
    inviteeName: formData.get("inviteeName") || undefined,
    grantsAgencyAdmin: formData.get("grantsAgencyAdmin") === "on",
    workspaceRoles,
  });
  if (!parsed.success) {
    return formatZodIssues(parsed.error.issues);
  }

  const rateLimit = await enforceRateLimit({
    scope: "invitation_create",
    subject: session.user.id,
    actorId: session.user.id,
  });
  if (!rateLimit.allowed) {
    return { error: formatRateLimitRetry(rateLimit.retryAfterSeconds) };
  }

  let result: Awaited<ReturnType<typeof createInvitation>>;
  try {
    result = await createInvitation({
      agencyId,
      email: parsed.data.email,
      ...(parsed.data.inviteeName ? { inviteeName: parsed.data.inviteeName } : {}),
      grantsAgencyAdmin: parsed.data.grantsAgencyAdmin,
      workspaceRoles: parsed.data.workspaceRoles,
      invitedBy: session.user.id,
    });
  } catch (e) {
    // Anything thrown by the service is either a known business
    // validation (e.g. "Invalid workspace access selection") or an
    // unexpected infrastructure failure (DB / SMTP). Surface a
    // friendly message to the user; the underlying error is logged
    // AND reported to Sentry (when configured) so on-call sees
    // sustained failures.
    captureError("users.sendInvite", e);
    return {
      error: "We couldn't send that invitation. The error has been logged. Please try again.",
    };
  }

  revalidatePath("/app/users");
  return {
    success: true,
    invitationId: result.id,
    expiresAt: result.expiresAt.toISOString().slice(0, 10),
    // In dev, surface the link; in prod, it's email-only
    devLink: process.env.NODE_ENV === "production" ? null : result.acceptUrl,
  };
}

export async function resendInviteAction(invitationId: string): Promise<InvitationActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in" };
  const actor = await currentActor();
  if (!actor) return { error: "Not signed in" };
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) return { error: "Agency not configured" };
  if (!(await isAgencyAdmin(actor, agencyId))) {
    return { error: "Only agency administrators can resend invitations." };
  }
  const rateLimit = await enforceRateLimit({
    scope: "invitation_resend",
    subject: session.user.id,
    actorId: session.user.id,
  });
  if (!rateLimit.allowed) {
    const rule = rateLimitRuleFor("invitation_resend");
    return { error: formatRateLimitRetry(rateLimit.retryAfterSeconds ?? rule.windowSeconds) };
  }
  try {
    await resendInvitation({ invitationId, agencyId, invitedBy: session.user.id });
  } catch (e) {
    // resendInvitation throws plain `Error`s for two known business
    // outcomes: the invitation no longer exists, or it's no longer
    // pending (revoked / expired / accepted). Either way, the row the
    // user clicked against is stale and the next render will refresh
    // the list — surface the literal message verbatim so the user
    // understands why the click didn't take effect. Sentry (when
    // configured) still sees the error so an infrastructure failure
    // (DB, SMTP) is distinguishable from the expected business outcomes.
    captureError("users.resendInvite", e);
    return {
      error: e instanceof Error && e.message ? e.message : "The invitation could not be resent.",
    };
  }
  revalidatePath("/app/users");
  return { success: true };
}

export async function revokeInviteAction(invitationId: string): Promise<InvitationActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in" };
  const actor = await currentActor();
  if (!actor) return { error: "Not signed in" };
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) return { error: "Agency not configured" };
  if (!(await isAgencyAdmin(actor, agencyId))) {
    return { error: "Only agency administrators can revoke invitations." };
  }
  try {
    await revokeInvitation({ invitationId, agencyId });
  } catch (e) {
    captureError("users.revokeInvite", e);
    return {
      error: e instanceof Error && e.message ? e.message : "The invitation could not be revoked.",
    };
  }
  revalidatePath("/app/users");
  return { success: true };
}

export async function toggleDeactivationAction(userId: string, currentlyActive: boolean) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in" };
  const actor = await currentActor();
  if (!actor) return { error: "Not signed in" };
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) return { error: "Agency not configured" };
  if (!(await isAgencyAdmin(actor, agencyId))) {
    throw new PermissionDeniedError("toggle_user_status");
  }
  if (currentlyActive) {
    try {
      await deactivateUser({ actorUserId: session.user.id, targetUserId: userId, agencyId });
    } catch (error) {
      const message =
        error instanceof Error &&
        (error.message === "You cannot deactivate your own account" ||
          error.message === "The final active agency administrator cannot be deactivated")
          ? error.message
          : "The member could not be deactivated.";
      return { error: message };
    }
  } else {
    await reactivateUser({ userId, agencyId, actorUserId: session.user.id });
  }
  revalidatePath("/app/users");
  return { success: true };
}

export type MemberEditState = { error?: string; saved?: boolean };

type ParsedWorkspaceGrant = { workspaceId: string; role: string };

function parseWorkspaceRolesJson(raw: FormDataEntryValue | null): ParsedWorkspaceGrant[] | null {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    const out: ParsedWorkspaceGrant[] = [];
    for (const entry of value) {
      if (
        entry &&
        typeof entry === "object" &&
        "workspaceId" in entry &&
        "role" in entry &&
        typeof (entry as { workspaceId: unknown }).workspaceId === "string" &&
        typeof (entry as { role: unknown }).role === "string"
      ) {
        out.push({
          workspaceId: (entry as { workspaceId: string }).workspaceId,
          role: (entry as { role: string }).role,
        });
      } else {
        return null;
      }
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Replace a member's per-workspace role assignments across the agency.
 *
 * Body contract:
 *  - `userId` (the action's first arg) — the target user
 *  - `formData.workspaceRoles` — JSON string `[{ workspaceId, role }]`
 *    where `role` is one of the 7 enum values OR an empty string meaning
 *    "no access" (the membership row stays, all role rows are removed).
 *
 * Safety:
 *  - Actor must be an active agency admin.
 *  - Actor cannot edit themselves (lockout: a non-admin can't reach this
 *    surface; a self-edit that demotes would lock the agency out).
 *  - The agency-membership row must be active (deactivated users are
 *    reactivated via the existing toggle, not this action).
 *
 * The replace is a single transaction: for every agency workspace, we
 * ensure the `workspace_membership` row exists (status: active) and then
 * either upsert the single role row (when a role was provided) or
 * delete any existing role rows (when "No access" was selected). The
 * action is idempotent — submitting the same selection twice is a no-op.
 */
export async function updateMemberRolesAction(
  userId: string,
  _prev: MemberEditState,
  formData: FormData,
): Promise<MemberEditState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in" };
  const actor = await currentActor();
  if (!actor) return { error: "Not signed in" };
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) return { error: "Agency not configured" };
  if (!(await isAgencyAdmin(actor, agencyId))) {
    throw new PermissionDeniedError("update_member_roles");
  }
  if (userId === session.user.id) {
    return { error: "You cannot edit your own role assignments." };
  }

  const grants = parseWorkspaceRolesJson(formData.get("workspaceRoles"));
  if (grants === null) {
    return { error: "Invalid workspace access selection." };
  }
  // Validate every role against the enum (empty string = "no access")
  for (const g of grants) {
    if (g.role !== "" && !workspaceRoleSchema.safeParse(g.role).success) {
      return { error: "Invalid workspace access selection." };
    }
  }
  // De-dup workspaces: last write wins (mirrors the form behaviour)
  const grantByWorkspace = new Map<string, string>();
  for (const g of grants) grantByWorkspace.set(g.workspaceId, g.role);

  // Confirm the target is an active member of this agency
  const [target] = await db
    .select({ userId: agencyMemberships.userId })
    .from(agencyMemberships)
    .where(
      and(
        eq(agencyMemberships.agencyId, agencyId),
        eq(agencyMemberships.userId, userId),
        eq(agencyMemberships.status, "active"),
      ),
    )
    .limit(1);
  if (!target) return { error: "Member not found." };

  // Load the agency's workspaces; scope the change to that set so a
  // malicious caller cannot inject an arbitrary workspaceId.
  const agencyWorkspaces = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.agencyId, agencyId));
  const validWorkspaceIds = new Set(agencyWorkspaces.map((w) => w.id));
  for (const id of grantByWorkspace.keys()) {
    if (!validWorkspaceIds.has(id)) {
      return { error: "Invalid workspace access selection." };
    }
  }

  try {
    await db.transaction(async (tx) => {
      for (const workspaceId of validWorkspaceIds) {
        const newRole = grantByWorkspace.get(workspaceId) ?? "";

        // Upsert the membership row so the user can hold a role here.
        // The `onConflictDoUpdate` SET clause intentionally does NOT
        // touch `joinedAt` (preserves the original membership date) and
        // does NOT set `updatedAt` (the `touch_updated_at` trigger
        // installed by migration 0004 + column added in 0021 is the
        // single source of truth for that column).
        const [membership] = await tx
          .insert(workspaceMemberships)
          .values({ workspaceId, userId, status: "active" })
          .onConflictDoUpdate({
            target: [workspaceMemberships.workspaceId, workspaceMemberships.userId],
            set: { status: "active", deactivatedAt: null },
          })
          .returning({ id: workspaceMemberships.id });
        if (!membership) continue;

        // Wipe existing roles for this membership, then insert the new one
        // if one was provided. Empty string == "no access" == no role rows.
        await tx
          .delete(workspaceMembershipRoles)
          .where(eq(workspaceMembershipRoles.workspaceMembershipId, membership.id));
        if (newRole !== "") {
          await tx.insert(workspaceMembershipRoles).values({
            workspaceMembershipId: membership.id,
            role: newRole as never,
          });
        }
      }

      await tx.insert(securityAuditEvents).values({
        actorId: session.user.id,
        action: "member_roles_update",
        targetType: "user",
        targetId: userId,
        outcome: "success",
        metadata: { workspaceCount: grantByWorkspace.size },
      });
    });
  } catch (err) {
    // A DB error (FK violation, trigger failure, connection drop, etc.)
    // MUST surface as an inline form state — never throw. Throwing
    // here would re-render the whole page through the error boundary
    // and replace the user's in-progress edit with a "We hit a snag"
    // page. The user would lose their selections and have to start
    // over. The captureError call still ships the event to Sentry
    // and the local `app_error_event` mirror for on-call to triage.
    captureError("users.updateMemberRoles", err);
    return {
      error:
        "We couldn't save the role assignments. The change has been recorded and the team will look at it shortly. Please try again.",
    };
  }

  revalidatePath("/app/users");
  // The team page on any workspace slug for this agency needs to refresh
  // (the new grant shows up on the per-workspace team table). Use the
  // route pattern so all dynamic [slug] pages under the same layout are
  // invalidated — workspace slugs aren't loaded here.
  revalidatePath(`/app/w/[slug]/team`, "page");
  return { saved: true };
}

/**
 * Toggle a member's `isAgencyAdmin` flag.
 *
 * Safety:
 *  - Actor must be an active agency admin.
 *  - The actor cannot change their own flag (a self-demote would lock
 *    the agency out of the user-management surface; the helper raises).
 *  - The final active agency admin cannot be demoted. The helper takes
 *    the count *after* the proposed change; we pass
 *    `current + (wouldPromote ? +1 : -1)`.
 */
export async function toggleAgencyAdminAction(
  userId: string,
  _prev: MemberEditState,
  formData: FormData,
): Promise<MemberEditState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in" };
  const actor = await currentActor();
  if (!actor) return { error: "Not signed in" };
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) return { error: "Agency not configured" };
  if (!(await isAgencyAdmin(actor, agencyId))) {
    throw new PermissionDeniedError("toggle_agency_admin");
  }

  // The form posts the desired next state ("on" === checked)
  const desired = formData.get("isAgencyAdmin") === "on";

  const [target] = await db
    .select({
      isAgencyAdmin: agencyMemberships.isAgencyAdmin,
    })
    .from(agencyMemberships)
    .where(
      and(
        eq(agencyMemberships.agencyId, agencyId),
        eq(agencyMemberships.userId, userId),
        eq(agencyMemberships.status, "active"),
      ),
    )
    .limit(1);
  if (!target) return { error: "Member not found." };

  // No-op when the form's desired state matches the DB — still revalidate
  // so any stale UI refreshes, and skip the safety check (no change).
  if (target.isAgencyAdmin === desired) {
    revalidatePath("/app/users");
    revalidatePath(`/app/w/[slug]/team`, "page");
    return { saved: true };
  }

  const [adminCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agencyMemberships)
    .where(
      and(
        eq(agencyMemberships.agencyId, agencyId),
        eq(agencyMemberships.status, "active"),
        eq(agencyMemberships.isAgencyAdmin, true),
      ),
    );
  const currentCount = adminCount?.count ?? 0;
  const afterCount = desired ? currentCount + 1 : currentCount - 1;

  try {
    assertCanDemoteAgencyAdmin({
      actorUserId: session.user.id,
      targetUserId: userId,
      // Only the demote path (target currently admin, desired false) needs
      // the lockout check; the promote path is always safe.
      targetIsAgencyAdmin: target.isAgencyAdmin && !desired,
      activeAgencyAdminCountAfterChange: afterCount,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : "The change could not be applied.";
    return { error: message };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(agencyMemberships)
      .set({ isAgencyAdmin: desired, updatedAt: new Date() })
      .where(and(eq(agencyMemberships.agencyId, agencyId), eq(agencyMemberships.userId, userId)));
    await tx.insert(securityAuditEvents).values({
      actorId: session.user.id,
      action: desired ? "member_promote_admin" : "member_demote_admin",
      targetType: "user",
      targetId: userId,
      outcome: "success",
    });
  });

  revalidatePath("/app/users");
  revalidatePath(`/app/w/[slug]/team`, "page");
  return { saved: true };
}

export type AddDirectlyActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
  /** Plaintext — only set on success, used for the one-time reveal. */
  tempPassword?: string;
  email?: string;
  userId?: string;
  acceptedWorkspaceIds?: string[];
};

/**
 * Server action for the "Add directly" tab on /app/users.
 *
 * The form posts `email`, `name`, `password`, `mustChangePassword`
 * (checkbox → "on"), `grantsAgencyAdmin` (checkbox → "on"), and
 * `workspaceRoles` (JSON string of `[{ workspaceId, role }]`).
 *
 * The plaintext `password` is the admin-supplied (or auto-generated
 * by the form's "Generate strong password" button) temporary
 * credential. The service hashes it; the action returns the plaintext
 * to the client for the one-time reveal strip, and never persists it
 * anywhere except as a bcrypt hash.
 *
 * On success: `tempPassword` + `email` + `acceptedWorkspaceIds` are
 * returned. The form's `key` (tied to `userId`) remounts so all
 * uncontrolled inputs reset, and the success strip renders with a
 * copy-to-clipboard button.
 */
export async function createUserDirectlyAction(
  _prev: AddDirectlyActionState | undefined,
  formData: FormData,
): Promise<AddDirectlyActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in. Please sign in again." };
  const actor = await currentActor();
  if (!actor) return { error: "Not signed in. Please sign in again." };
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) return { error: "Agency not configured. Contact the platform admin." };
  if (!(await isAgencyAdmin(actor, agencyId))) {
    return { error: "Only agency administrators can add users directly." };
  }

  let workspaceRoles: unknown = [];
  try {
    const raw = formData.get("workspaceRoles");
    workspaceRoles = typeof raw === "string" && raw ? JSON.parse(raw) : [];
  } catch {
    return {
      error: "Invalid workspace access selection.",
      fieldErrors: { workspaceRoles: ["Invalid JSON"] },
    };
  }

  const parsed = userCreateCommandSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name") || undefined,
    password: formData.get("password"),
    mustChangePassword: formData.get("mustChangePassword") === "on",
    grantsAgencyAdmin: formData.get("grantsAgencyAdmin") === "on",
    workspaceRoles,
  });
  if (!parsed.success) {
    return formatZodIssues(parsed.error.issues);
  }

  const rateLimit = await enforceRateLimit({
    scope: "user_create",
    subject: session.user.id,
    actorId: session.user.id,
  });
  if (!rateLimit.allowed) {
    return { error: formatRateLimitRetry(rateLimit.retryAfterSeconds) };
  }

  try {
    const result = await createUserDirectly({
      agencyId,
      email: parsed.data.email,
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      password: parsed.data.password,
      mustChangePassword: parsed.data.mustChangePassword,
      grantsAgencyAdmin: parsed.data.grantsAgencyAdmin,
      workspaceRoles: parsed.data.workspaceRoles,
      createdBy: session.user.id,
    });
    revalidatePath("/app/users");
    revalidatePath(`/app/w/[slug]/team`, "page");
    return {
      success: true,
      tempPassword: result.tempPassword,
      email: result.email,
      userId: result.userId,
      acceptedWorkspaceIds: result.acceptedWorkspaceIds,
    };
  } catch (e) {
    // Translate known business errors to inline form state; the rest
    // is treated as an infrastructure failure (DB / SMTP) and shipped
    // to Sentry so on-call sees sustained failures.
    if (e instanceof UserAlreadyExistsError) {
      return {
        error: e.message,
        fieldErrors: { email: ["This email already has an account."] },
      };
    }
    if (e instanceof ActiveAgencyMemberError) {
      return {
        error: e.message,
        fieldErrors: { email: ["Already an active member of this agency."] },
      };
    }
    if (e instanceof InvalidPasswordError) {
      return {
        error: e.message,
        fieldErrors: { password: [e.message] },
      };
    }
    captureError("users.createUserDirectly", e);
    return {
      error: "We couldn't create that user. The error has been logged. Please try again.",
    };
  }
}
