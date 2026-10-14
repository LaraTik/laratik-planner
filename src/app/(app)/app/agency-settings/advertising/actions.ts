"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { db } from "@/lib/db";
import {
  advertisingAccounts,
  advertisingCapabilities,
  advertisingConnectionAccounts,
  advertisingConnections,
  advertisingFinancialAuthorities,
  advertisingValidationResults,
  advertisingVisibilityGrants,
  advertisingSocialIdentities,
  advertisingSyncRuns,
  advertisingSyncStates,
  advertisingSpendReconciliations,
  workspaces,
} from "@/lib/db/schema";
import {
  AdvertisingConnectionInputError,
  createAdvertisingConnection,
  updateAdvertisingGraphApiVersion,
} from "@/lib/advertising/connection-service";
import {
  AdvertisingConnectionNotFoundError,
  AdvertisingConnectionRevokedError,
  revokeAdvertisingConnection,
  revokeAdvertisingAccountAccess,
  storeAdvertisingCredential,
} from "@/lib/advertising/credential-service";
import { resolveAdvertisingCredential } from "@/lib/advertising/credential-service";
import { createMetaReadClient } from "@/lib/advertising/meta-http";
import { createMetaAdvertisingProvider } from "@/lib/advertising/providers/meta";
import { runMetaConfigurationWorkflow } from "@/lib/advertising/meta-workflow";
import {
  grantAdvertisingFinancialAuthority,
  grantAdvertisingVisibility,
  revokeAdvertisingFinancialAuthority,
  revokeAdvertisingVisibility,
} from "@/lib/advertising/grant-service";
import { AdvertisingGrantInputError } from "@/lib/advertising/grant-service";
import { AdvertisingSyncInputError, setAdvertisingSyncState } from "@/lib/advertising/sync-service";

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
const GraphVersionSchema = z.object({
  connectionId: z.string().uuid(),
  graphApiVersion: z
    .string()
    .trim()
    .regex(/^v\d+\.\d+$/),
});
const AccountAccessSchema = z.object({
  connectionId: z.string().uuid(),
  accountId: z.string().uuid(),
});
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
  campaignIds: z.array(z.string().trim().min(1)).max(500).nullable(),
  adSetIds: z.array(z.string().trim().min(1)).max(500).nullable(),
  adIds: z.array(z.string().trim().min(1)).max(500).nullable(),
});
const FinancialAuthoritySchema = z.object({
  accountId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
});
const GrantIdSchema = z.object({ grantId: z.string().uuid() });
const AuthorityIdSchema = z.object({ authorityId: z.string().uuid() });
const SyncStateSchema = z.object({
  connectionId: z.string().uuid(),
  accountId: z.string().uuid(),
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
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
  if (error instanceof AdvertisingSyncInputError) return { code: error.message };
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
    "advertising_account_not_active",
    "advertising_connection_revoked",
    "advertising_account_not_in_agency",
    "workspace_not_in_agency",
    "unsupported_advertising_capability",
    "advertising_grant_range_invalid",
    "advertising_grant_not_found",
    "advertising_financial_authority_not_found",
    "invalid_graph_api_version",
  ]);
  return { code: safeCodes.has(code) ? code : "advertising_action_failed" };
}

function parseScopeIds(value: FormDataEntryValue | null): string[] | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length ? ids : null;
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

export async function updateAdvertisingGraphApiVersionAction(
  _previous: AdvertisingActionState,
  formData: FormData,
): Promise<AdvertisingActionState> {
  try {
    const { actor, agencyId } = await requireAdmin();
    const parsed = GraphVersionSchema.safeParse({
      connectionId: formData.get("connectionId"),
      graphApiVersion: formData.get("graphApiVersion"),
    });
    if (!parsed.success) return { code: "invalid_graph_api_version" };
    const updated = await updateAdvertisingGraphApiVersion(db, {
      agencyId,
      connectionId: parsed.data.connectionId,
      graphApiVersion: parsed.data.graphApiVersion,
      actorId: actor.id,
    });
    revalidatePath("/app/agency-settings/advertising");
    return { ok: true, code: "graph_version_updated", connectionId: updated.connectionId };
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

export async function revokeAdvertisingAccountAccessAction(
  _previous: AdvertisingActionState,
  formData: FormData,
): Promise<AdvertisingActionState> {
  try {
    const { agencyId } = await requireAdmin();
    const parsed = AccountAccessSchema.safeParse({
      connectionId: formData.get("connectionId"),
      accountId: formData.get("accountId"),
    });
    if (!parsed.success) return { code: "invalid_connection" };
    await revokeAdvertisingAccountAccess(db, { agencyId, ...parsed.data });
    revalidatePath("/app/agency-settings/advertising");
    return { ok: true, code: "advertising_account_access_revoked" };
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
          return resolveAdvertisingCredential(db, {
            agencyId,
            connectionId: row.id,
            allowPendingValidation: true,
          });
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
      campaignIds: parseScopeIds(formData.get("campaignIds")),
      adSetIds: parseScopeIds(formData.get("adSetIds")),
      adIds: parseScopeIds(formData.get("adIds")),
    });
    if (!parsed.success) return { code: "invalid_grant" };
    const grant = await grantAdvertisingVisibility(db, {
      agencyId,
      accountId: parsed.data.accountId,
      workspaceId: parsed.data.workspaceId,
      capability: parsed.data.capability,
      campaignIds: parsed.data.campaignIds,
      adSetIds: parsed.data.adSetIds,
      adIds: parsed.data.adIds,
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

export async function revokeAdvertisingVisibilityAction(
  _previous: AdvertisingActionState,
  formData: FormData,
): Promise<AdvertisingActionState> {
  try {
    const { actor, agencyId } = await requireAdmin();
    const parsed = GrantIdSchema.safeParse({ grantId: formData.get("grantId") });
    if (!parsed.success) return { code: "invalid_grant" };
    await revokeAdvertisingVisibility(db, {
      agencyId,
      grantId: parsed.data.grantId,
      revokedBy: actor.id,
    });
    revalidatePath("/app/agency-settings/advertising");
    return { ok: true, code: "grant_revoked", grantId: parsed.data.grantId };
  } catch (error) {
    return errorState(error);
  }
}

export async function revokeAdvertisingFinancialAuthorityAction(
  _previous: AdvertisingActionState,
  formData: FormData,
): Promise<AdvertisingActionState> {
  try {
    const { actor, agencyId } = await requireAdmin();
    const parsed = AuthorityIdSchema.safeParse({ authorityId: formData.get("authorityId") });
    if (!parsed.success) return { code: "invalid_financial_authority" };
    await revokeAdvertisingFinancialAuthority(db, {
      agencyId,
      authorityId: parsed.data.authorityId,
      revokedBy: actor.id,
    });
    revalidatePath("/app/agency-settings/advertising");
    return { ok: true, code: "financial_authority_revoked", authorityId: parsed.data.authorityId };
  } catch (error) {
    return errorState(error);
  }
}

export async function setAdvertisingSyncStateAction(
  _previous: AdvertisingActionState,
  formData: FormData,
): Promise<AdvertisingActionState> {
  try {
    const { actor, agencyId } = await requireAdmin();
    const parsed = SyncStateSchema.safeParse({
      connectionId: formData.get("connectionId"),
      accountId: formData.get("accountId"),
      enabled: formData.get("enabled"),
    });
    if (!parsed.success) return { code: "invalid_sync_state" };
    const state = await setAdvertisingSyncState(db, {
      agencyId,
      ...parsed.data,
      actorId: actor.id,
    });
    revalidatePath("/app/agency-settings/advertising");
    return {
      ok: true,
      code: parsed.data.enabled ? "sync_activated" : "sync_disabled",
      connectionId: state.connectionId,
    };
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
  const [
    accounts,
    agencyWorkspaces,
    syncStates,
    connectionAccounts,
    socialIdentities,
    capabilities,
    visibilityGrants,
    financialAuthorities,
    validationResults,
    reconciliations,
    syncRuns,
  ] = await Promise.all([
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
    db
      .select({
        id: advertisingSyncStates.id,
        connectionId: advertisingSyncStates.connectionId,
        accountId: advertisingSyncStates.accountId,
        accountName: advertisingAccounts.name,
        externalAccountId: advertisingAccounts.externalAccountId,
        status: advertisingSyncStates.status,
        lastCompletedAt: advertisingSyncStates.lastCompletedAt,
        nextRunAt: advertisingSyncStates.nextRunAt,
        lastErrorCode: advertisingSyncStates.lastErrorCode,
      })
      .from(advertisingSyncStates)
      .innerJoin(
        advertisingConnections,
        and(
          eq(advertisingConnections.id, advertisingSyncStates.connectionId),
          eq(advertisingConnections.agencyId, agencyId),
        ),
      )
      .innerJoin(advertisingAccounts, eq(advertisingAccounts.id, advertisingSyncStates.accountId))
      .orderBy(desc(advertisingSyncStates.updatedAt)),
    db
      .select({
        connectionId: advertisingConnectionAccounts.connectionId,
        accountId: advertisingConnectionAccounts.accountId,
        accountName: advertisingAccounts.name,
        externalAccountId: advertisingAccounts.externalAccountId,
        status: advertisingConnectionAccounts.status,
      })
      .from(advertisingConnectionAccounts)
      .innerJoin(
        advertisingConnections,
        and(
          eq(advertisingConnections.id, advertisingConnectionAccounts.connectionId),
          eq(advertisingConnections.agencyId, agencyId),
        ),
      )
      .innerJoin(
        advertisingAccounts,
        eq(advertisingAccounts.id, advertisingConnectionAccounts.accountId),
      )
      .orderBy(desc(advertisingConnectionAccounts.updatedAt)),
    db
      .select({
        id: advertisingSocialIdentities.id,
        connectionId: advertisingSocialIdentities.connectionId,
        accountId: advertisingSocialIdentities.accountId,
        identityType: advertisingSocialIdentities.identityType,
        externalIdentityId: advertisingSocialIdentities.externalIdentityId,
        displayName: advertisingSocialIdentities.displayName,
        username: advertisingSocialIdentities.username,
        status: advertisingSocialIdentities.status,
      })
      .from(advertisingSocialIdentities)
      .innerJoin(
        advertisingConnections,
        and(
          eq(advertisingConnections.id, advertisingSocialIdentities.connectionId),
          eq(advertisingConnections.agencyId, agencyId),
        ),
      )
      .where(eq(advertisingSocialIdentities.agencyId, agencyId))
      .orderBy(desc(advertisingSocialIdentities.updatedAt)),
    db
      .select({
        id: advertisingCapabilities.id,
        connectionId: advertisingCapabilities.connectionId,
        accountId: advertisingCapabilities.accountId,
        capability: advertisingCapabilities.capability,
        status: advertisingCapabilities.status,
        checkedAt: advertisingCapabilities.checkedAt,
      })
      .from(advertisingCapabilities)
      .innerJoin(
        advertisingConnections,
        and(
          eq(advertisingConnections.id, advertisingCapabilities.connectionId),
          eq(advertisingConnections.agencyId, agencyId),
        ),
      )
      .innerJoin(advertisingAccounts, eq(advertisingAccounts.id, advertisingCapabilities.accountId))
      .where(eq(advertisingAccounts.agencyId, agencyId))
      .orderBy(desc(advertisingCapabilities.checkedAt)),
    db
      .select({
        id: advertisingVisibilityGrants.id,
        accountId: advertisingVisibilityGrants.accountId,
        accountName: advertisingAccounts.name,
        workspaceId: advertisingVisibilityGrants.workspaceId,
        workspaceName: workspaces.name,
        capability: advertisingVisibilityGrants.capability,
        campaignIds: advertisingVisibilityGrants.campaignIds,
        adSetIds: advertisingVisibilityGrants.adSetIds,
        adIds: advertisingVisibilityGrants.adIds,
        startsAt: advertisingVisibilityGrants.startsAt,
        endsAt: advertisingVisibilityGrants.endsAt,
        revokedAt: advertisingVisibilityGrants.revokedAt,
      })
      .from(advertisingVisibilityGrants)
      .innerJoin(
        advertisingAccounts,
        eq(advertisingAccounts.id, advertisingVisibilityGrants.accountId),
      )
      .leftJoin(workspaces, eq(workspaces.id, advertisingVisibilityGrants.workspaceId))
      .where(eq(advertisingVisibilityGrants.agencyId, agencyId))
      .orderBy(desc(advertisingVisibilityGrants.createdAt)),
    db
      .select({
        id: advertisingFinancialAuthorities.id,
        accountId: advertisingFinancialAuthorities.accountId,
        accountName: advertisingAccounts.name,
        workspaceId: advertisingFinancialAuthorities.workspaceId,
        workspaceName: workspaces.name,
        startsAt: advertisingFinancialAuthorities.startsAt,
        endsAt: advertisingFinancialAuthorities.endsAt,
        revokedAt: advertisingFinancialAuthorities.revokedAt,
      })
      .from(advertisingFinancialAuthorities)
      .innerJoin(
        advertisingAccounts,
        eq(advertisingAccounts.id, advertisingFinancialAuthorities.accountId),
      )
      .leftJoin(workspaces, eq(workspaces.id, advertisingFinancialAuthorities.workspaceId))
      .where(eq(advertisingFinancialAuthorities.agencyId, agencyId))
      .orderBy(desc(advertisingFinancialAuthorities.createdAt)),
    db
      .select({
        id: advertisingValidationResults.id,
        connectionId: advertisingValidationResults.connectionId,
        accountId: advertisingValidationResults.accountId,
        operation: advertisingValidationResults.operation,
        status: advertisingValidationResults.status,
        sanitizedCode: advertisingValidationResults.sanitizedCode,
        retryable: advertisingValidationResults.retryable,
        checkedAt: advertisingValidationResults.checkedAt,
      })
      .from(advertisingValidationResults)
      .innerJoin(
        advertisingConnections,
        and(
          eq(advertisingConnections.id, advertisingValidationResults.connectionId),
          eq(advertisingConnections.agencyId, agencyId),
        ),
      )
      .orderBy(desc(advertisingValidationResults.checkedAt))
      .limit(100),
    db
      .select({
        id: advertisingSpendReconciliations.id,
        accountId: advertisingSpendReconciliations.accountId,
        accountName: advertisingAccounts.name,
        reportDate: advertisingSpendReconciliations.reportDate,
        currency: advertisingSpendReconciliations.currency,
        providerAccountSpend: advertisingSpendReconciliations.providerAccountSpend,
        canonicalAdSpend: advertisingSpendReconciliations.canonicalAdSpend,
        workspaceAttributedSpend: advertisingSpendReconciliations.workspaceAttributedSpend,
        unallocatedSpend: advertisingSpendReconciliations.unallocatedSpend,
        discrepancy: advertisingSpendReconciliations.discrepancy,
        completeness: advertisingSpendReconciliations.completeness,
        checkedAt: advertisingSpendReconciliations.checkedAt,
      })
      .from(advertisingSpendReconciliations)
      .innerJoin(
        advertisingAccounts,
        eq(advertisingAccounts.id, advertisingSpendReconciliations.accountId),
      )
      .where(eq(advertisingSpendReconciliations.agencyId, agencyId))
      .orderBy(desc(advertisingSpendReconciliations.checkedAt))
      .limit(100),
    db
      .select({
        id: advertisingSyncRuns.id,
        connectionId: advertisingSyncRuns.connectionId,
        accountId: advertisingSyncRuns.accountId,
        accountName: advertisingAccounts.name,
        status: advertisingSyncRuns.status,
        rowsRead: advertisingSyncRuns.rowsRead,
        rowsWritten: advertisingSyncRuns.rowsWritten,
        errorCode: advertisingSyncRuns.errorCode,
        partial: advertisingSyncRuns.partial,
        startedAt: advertisingSyncRuns.startedAt,
        completedAt: advertisingSyncRuns.completedAt,
      })
      .from(advertisingSyncRuns)
      .innerJoin(
        advertisingConnections,
        and(
          eq(advertisingConnections.id, advertisingSyncRuns.connectionId),
          eq(advertisingConnections.agencyId, agencyId),
        ),
      )
      .innerJoin(advertisingAccounts, eq(advertisingAccounts.id, advertisingSyncRuns.accountId))
      .orderBy(desc(advertisingSyncRuns.startedAt))
      .limit(100),
  ]);
  return {
    accounts,
    workspaces: agencyWorkspaces,
    syncStates,
    connectionAccounts,
    socialIdentities,
    capabilities,
    visibilityGrants,
    financialAuthorities,
    validationResults,
    syncRuns,
    reconciliations,
  };
}
