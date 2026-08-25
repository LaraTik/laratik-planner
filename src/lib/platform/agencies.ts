import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  agencies,
  agencyEntitlements,
  agencyMemberships,
  agencyUsageCounters,
  invitations,
  platformAuditEvents,
  platformPlanTemplates,
  users,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { OverrideShapeSchema } from "@/lib/entitlements";
import { requirePlatformPermission } from "@/lib/auth/platform-access";
import type { Actor } from "@/lib/auth/policy";
import { clientEnv, serverEnv } from "@/lib/validation/env";
import { logError } from "@/lib/observability/logger";

export const CreateAgencySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/),
  locale: z.string().trim().min(2).max(20).default("en"),
  timezone: z.string().trim().min(2).max(80).default("UTC"),
  adminEmail: z.string().trim().toLowerCase().email(),
  adminName: z.string().trim().min(1).max(120),
  planTemplateId: z.string().uuid(),
  overrides: OverrideShapeSchema.default({}),
  reason: z.string().trim().min(3).max(500),
});

export type CreateAgencyInput = z.infer<typeof CreateAgencySchema>;

export async function createAgency(actor: Actor, raw: CreateAgencyInput) {
  await requirePlatformPermission(actor, "platform.agency.create");
  const input = CreateAgencySchema.parse(raw);
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const result = await db.transaction(async (tx) => {
    const [plan] = await tx
      .select({ id: platformPlanTemplates.id, name: platformPlanTemplates.name })
      .from(platformPlanTemplates)
      .where(
        and(
          eq(platformPlanTemplates.id, input.planTemplateId),
          isNull(platformPlanTemplates.archivedAt),
        ),
      )
      .limit(1);
    if (!plan) throw new Error("Plan template not found");

    const [agency] = await tx
      .insert(agencies)
      .values({
        name: input.name,
        slug: input.slug,
        settings: { locale: input.locale, timezone: input.timezone },
      })
      .returning({ id: agencies.id, name: agencies.name, slug: agencies.slug });
    if (!agency) throw new Error("Agency could not be created");

    await tx.insert(agencyEntitlements).values({
      agencyId: agency.id,
      planTemplateId: plan.id,
      overrides: Object.keys(input.overrides).length > 0 ? input.overrides : null,
      hardStopPercent: "100",
      gracePolicy: "block",
    });

    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.adminEmail))
      .limit(1);
    let invitationId: string | null = null;
    if (existingUser) {
      await tx.insert(agencyMemberships).values({
        agencyId: agency.id,
        userId: existingUser.id,
        status: "active",
        isAgencyAdmin: true,
      });
    } else {
      const [invitation] = await tx
        .insert(invitations)
        .values({
          agencyId: agency.id,
          email: input.adminEmail,
          inviteeName: input.adminName,
          tokenHash,
          expiresAt,
          invitedBy: actor.id,
          grantsAgencyAdmin: true,
        })
        .returning({ id: invitations.id });
      invitationId = invitation?.id ?? null;
    }

    await tx.insert(agencyUsageCounters).values({
      agencyId: agency.id,
      resourceKey: "users",
      currentValue: 1,
      version: 1,
    });
    await tx.insert(platformAuditEvents).values({
      actorUserId: actor.id,
      action: "agency.create",
      target: { type: "agency", id: agency.id },
      before: null,
      after: {
        name: agency.name,
        slug: agency.slug,
        planTemplateId: plan.id,
        planName: plan.name,
        firstAdminEmail: input.adminEmail,
        reason: input.reason,
      },
    });
    return { ...agency, invitationId, existingUserId: existingUser?.id ?? null };
  });

  const appUrl = serverEnv.AUTH_URL || clientEnv.NEXT_PUBLIC_APP_URL;
  const acceptUrl = `${appUrl}/accept-invitation?token=${rawToken}`;
  let emailSent = true;
  try {
    await sendEmail({
      to: input.adminEmail,
      subject: `You're invited to manage ${input.name}`,
      text: result.invitationId
        ? `You are the first administrator for ${input.name}. Accept the invitation: ${acceptUrl}`
        : `You are now an administrator for ${input.name}. Sign in at ${appUrl}/signin`,
    });
  } catch (cause) {
    emailSent = false;
    logError("platform.agency_admin_email_failed", {
      cause,
      agencyId: result.id,
      invitationId: result.invitationId,
    });
  }
  return {
    ...result,
    emailSent,
    acceptUrl: result.invitationId ? acceptUrl : null,
  };
}

export const AgencyLifecycleActionSchema = z.object({
  agencyId: z.string().uuid(),
  action: z.enum(["suspend", "restore", "archive", "unarchive"]),
  reason: z.string().trim().min(3).max(500),
});

export class AgencyLifecycleError extends Error {
  constructor(
    message: string,
    public readonly code: "not-found" | "restore-archived",
  ) {
    super(message);
    this.name = "AgencyLifecycleError";
  }
}

export async function changeAgencyLifecycle(
  actor: Actor,
  raw: z.infer<typeof AgencyLifecycleActionSchema>,
) {
  const input = AgencyLifecycleActionSchema.parse(raw);
  await requirePlatformPermission(
    actor,
    input.action === "archive" || input.action === "unarchive"
      ? "platform.agency.archive"
      : "platform.agency.lifecycle.manage",
  );
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({ suspendedAt: agencies.suspendedAt, archivedAt: agencies.archivedAt })
      .from(agencies)
      .where(eq(agencies.id, input.agencyId))
      .for("update")
      .limit(1);
    if (!before) throw new AgencyLifecycleError("Agency not found", "not-found");
    if (input.action === "restore" && before.archivedAt) {
      throw new AgencyLifecycleError(
        "Archived agencies must be unarchived by a Platform Owner before they can be restored.",
        "restore-archived",
      );
    }
    const now = new Date();
    const update =
      input.action === "suspend"
        ? { suspendedAt: now }
        : input.action === "archive"
          ? { archivedAt: now, suspendedAt: now }
          : input.action === "unarchive"
            ? { archivedAt: null, suspendedAt: null }
            : { suspendedAt: null };
    await tx
      .update(agencies)
      .set({ ...update, updatedAt: now })
      .where(eq(agencies.id, input.agencyId));
    await tx.insert(platformAuditEvents).values({
      actorUserId: actor.id,
      action: `agency.${input.action}`,
      target: { type: "agency", id: input.agencyId },
      before,
      after: { ...update, reason: input.reason },
    });
    return { ok: true as const };
  });
}
