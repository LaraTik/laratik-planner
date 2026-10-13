"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { db } from "@/lib/db";
import { advertisingAccounts, advertisingConnections, workspaces } from "@/lib/db/schema";
import {
  AdvertisingConnectionInputError,
  createAdvertisingConnection,
} from "@/lib/advertising/connection-service";
import {
  AdvertisingConnectionNotFoundError,
  AdvertisingConnectionRevokedError,
  revokeAdvertisingConnection,
  storeAdvertisingCredential,
} from "@/lib/advertising/credential-service";
import { resolveAdvertisingCredential } from "@/lib/advertising/credential-service";
import { createMetaReadClient } from "@/lib/advertising/meta-http";
import { createMetaAdvertisingProvider } from "@/lib/advertising/providers/meta";
import { runMetaConfigurationWorkflow } from "@/lib/advertising/meta-workflow";
import {
  grantAdvertisingFinancialAuthority,
  grantAdvertisingVisibility,
} from "@/lib/advertising/grant-service";
import { AdvertisingGrantInputError } from "@/lib/advertising/grant-service";

const ConnectionSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  appId: z.string().trim().max(200).optional(),
  graphApiVersion: z
    .string()
    .trim()
    .regex(/^v\d+\.\d+$/)
    .optional(),
});
const CredentialSchema = z.object({
  connectionId: z.string().uuid(),
  accessToken: z.string().min(1).max(8_000),
});
const ConnectionIdSchema = z.object({ connectionId: z.string().uuid() });
const GrantSchema = z.object({
  accountId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  capability: z.enum([
    "read_campaigns",
    "read_adsets",
    "read_ads",
    "read_creatives",
    "read_reports",
    "export_reports",
    "use_ai_context",
  ]),
});
const FinancialAuthoritySchema = z.object({
  accountId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
});

export type AdvertisingActionState = {
  ok?: boolean;
  code?: string;
  connectionId?: string;
  version?: number;
  grantId?: string;
  authorityId?: string;
  diagnostics?: readonly { operation: string; state: string; retryable: boolean }[];
};

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("not_signed_in");
  const actor = await currentActor();
  if (!actor) throw new Error("not_signed_in");
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) throw new Error("agency_not_configured");
  if (!(await isAgencyAdmin(actor, context.agencyId))) throw new Error("agency_admin_required");
  return { actor, agencyId: context.agencyId };
}

function errorState(error: unknown): AdvertisingActionState {
  if (error instanceof AdvertisingConnectionInputError) return { code: error.message };
  if (error instanceof AdvertisingGrantInputError) return { code: error.message };
  if (error instanceof AdvertisingConnectionNotFoundError)
    return { code: "advertising_connection_not_found" };
  if (error instanceof AdvertisingConnectionRevokedError)
    return { code: "advertising_connection_revoked" };
  const code = error instanceof Error ? error.message : "";
  const safeCodes = new Set([
    "not_signed_in",
    "agency_not_configured",
    "agency_admin_required",
    "advertising_connection_not_found",
    "advertising_connection_not_active",
    "advertising_connection_account_not_active",
    "advertising_connection_revoked",
    "advertising_account_not_in_agency",
    "workspace_not_in_agency",
    "unsupported_advertising_capability",
    "advertising_grant_range_invalid",
  ]);
  return { code: safeCodes.has(code) ? code : "advertising_action_failed" };
}

export async function createAdvertisingConnectionAction(
  _previous: AdvertisingActionState,
  formData: FormData,
): Promise<AdvertisingActionState> {
  try {
    const { actor, agencyId } = await requireAdmin();
    const parsed = ConnectionSchema.safeParse({
      displayName: formData.get("displayName"),
      appId: formData.get("appId") || undefined,
      graphApiVersion: formData.get("graphApiVersion") || undefined,
    });
    if (!parsed.success) return { code: "invalid_connection" };
    const created = await createAdvertisingConnection(db, {
      agencyId,
      provider: "meta",
      displayName: parsed.data.displayName,
      appId: parsed.data.appId,
      graphApiVersion: parsed.data.graphApiVersion,
      actorId: actor.id,
    });
    revalidatePath("/app/agency-settings/advertising");
    return { ok: true, code: "connection_created", connectionId: created.id };
  } catch (error) {
    return errorState(error);
  }
}

export async function storeAdvertisingCredentialAction(
  _previous: AdvertisingActionState,
  formData: FormData,
): Promise<AdvertisingActionState> {
  try {
    const { actor, agencyId } = await requireAdmin();
    const parsed = CredentialSchema.safeParse({
      connectionId: formData.get("connectionId"),
      accessToken: formData.get("accessToken"),
    });
    if (!parsed.success) return { code: "invalid_credential" };
    const stored = await storeAdvertisingCredential(db, {
      agencyId,
      connectionId: parsed.data.connectionId,
      credentials: { accessToken: parsed.data.accessToken },
      actorId: actor.id,
    });
    revalidatePath("/app/agency-settings/advertising");
    return {
      ok: true,
      code: "credential_stored",
      connectionId: stored.connectionId,
      version: stored.version,
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function revokeAdvertisingConnectionAction(
  _previous: AdvertisingActionState,
  formData: FormData,
): Promise<AdvertisingActionState> {
  try {
    const { agencyId } = await requireAdmin();
    const parsed = ConnectionIdSchema.safeParse({ connectionId: formData.get("connectionId") });
    if (!parsed.success) return { code: "invalid_connection" };
    await revokeAdvertisingConnection(db, { agencyId, ...parsed.data });
    revalidatePath("/app/agency-settings/advertising");
    return { ok: true, code: "connection_revoked" };
  } catch (error) {
    return errorState(error);
  }
}

export async function validateAdvertisingConnectionAction(
  connectionId: string,
): Promise<AdvertisingActionState> {
  try {
    const { agencyId } = await requireAdmin();
    const [row] = await db
      .select()
      .from(advertisingConnections)
      .where(
        and(
          eq(advertisingConnections.id, connectionId),
          eq(advertisingConnections.agencyId, agencyId),
        ),
      )
      .limit(1);
    if (!row) return { code: "advertising_connection_not_found" };
    const connection = {
      id: row.id,
      provider: "meta" as const,
      agencyId,
      credentialRef: row.credentialRef,
      status: row.status as "active" | "revoked" | "invalid",
      lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
    };
    const provider = createMetaAdvertisingProvider(
      {
        async resolve(credentialRef) {
          if (credentialRef !== row.credentialRef) throw new Error("credential_reference_mismatch");
          return resolveAdvertisingCredential(db, { agencyId, connectionId: row.id });
        },
      },
      (credential) => createMetaReadClient(row.graphApiVersion, credential),
    );
    const result = await runMetaConfigurationWorkflow(db, { agencyId, connection, provider });
    revalidatePath("/app/agency-settings/advertising");
    return {
      ok: result.status === "passed",
      code: `workflow_${result.status}`,
      diagnostics: result.diagnostics,
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function grantAdvertisingVisibilityAction(
  _previous: AdvertisingActionState,
  formData: FormData,
): Promise<AdvertisingActionState> {
  try {
    const { actor, agencyId } = await requireAdmin();
    const parsed = GrantSchema.safeParse({
      accountId: formData.get("accountId"),
      workspaceId: formData.get("workspaceId") || undefined,
      capability: formData.get("capability"),
    });
    if (!parsed.success) return { code: "invalid_grant" };
    const grant = await grantAdvertisingVisibility(db, {
      agencyId,
      accountId: parsed.data.accountId,
      workspaceId: parsed.data.workspaceId,
      capability: parsed.data.capability,
      grantedBy: actor.id,
    });
    revalidatePath("/app/agency-settings/advertising");
    return { ok: true, code: "grant_created", grantId: grant.id };
  } catch (error) {
    return errorState(error);
  }
}

export async function grantAdvertisingFinancialAuthorityAction(
  _previous: AdvertisingActionState,
  formData: FormData,
): Promise<AdvertisingActionState> {
  try {
    const { actor, agencyId } = await requireAdmin();
    const parsed = FinancialAuthoritySchema.safeParse({
      accountId: formData.get("accountId"),
      workspaceId: formData.get("workspaceId") || undefined,
    });
    if (!parsed.success) return { code: "invalid_financial_authority" };
    const authority = await grantAdvertisingFinancialAuthority(db, {
      agencyId,
      accountId: parsed.data.accountId,
      workspaceId: parsed.data.workspaceId,
      grantedBy: actor.id,
    });
    revalidatePath("/app/agency-settings/advertising");
    return { ok: true, code: "financial_authority_created", authorityId: authority.id };
  } catch (error) {
    return errorState(error);
  }
}

export async function listAdvertisingConnectionsForAdmin() {
  const { agencyId } = await requireAdmin();
  return db
    .select({
      id: advertisingConnections.id,
      displayName: advertisingConnections.displayName,
      provider: advertisingConnections.provider,
      status: advertisingConnections.status,
      currentCredentialVersion: advertisingConnections.currentCredentialVersion,
      lastValidatedAt: advertisingConnections.lastValidatedAt,
      lastValidationStatus: advertisingConnections.lastValidationStatus,
      lastValidationCode: advertisingConnections.lastValidationCode,
      graphApiVersion: advertisingConnections.graphApiVersion,
      createdAt: advertisingConnections.createdAt,
    })
    .from(advertisingConnections)
    .where(eq(advertisingConnections.agencyId, agencyId))
    .orderBy(desc(advertisingConnections.createdAt));
}

export async function listAdvertisingResourcesForAdmin() {
  const { agencyId } = await requireAdmin();
  const [accounts, agencyWorkspaces] = await Promise.all([
    db
      .select({
        id: advertisingAccounts.id,
        name: advertisingAccounts.name,
        externalAccountId: advertisingAccounts.externalAccountId,
        currency: advertisingAccounts.currency,
        timezone: advertisingAccounts.timezone,
        status: advertisingAccounts.status,
      })
      .from(advertisingAccounts)
      .where(eq(advertisingAccounts.agencyId, agencyId))
      .orderBy(desc(advertisingAccounts.name)),
    db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.agencyId, agencyId))
      .orderBy(desc(workspaces.name)),
  ]);
  return { accounts, workspaces: agencyWorkspaces };
}
