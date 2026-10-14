import { and, eq, gt, ne, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { db as appDb } from "@/lib/db";
import {
  advertisingAccounts,
  advertisingCapabilities,
  advertisingConnectionAccounts,
  advertisingConnectionAgencyAccess,
  advertisingConnections,
  advertisingProviderAccountIdentities,
  advertisingProviderObjects,
  advertisingSocialIdentities,
  advertisingSyncStates,
  advertisingValidationResults,
  securityAuditEvents,
} from "@/lib/db/schema";
import type { AdvertisingCapability, AdvertisingProvider } from "./types";

type Db = typeof appDb;

const BLOCKED_METADATA_KEYS =
  /token|secret|password|credential|authorization|cookie|private[_-]?key/i;
const MAX_METADATA_KEYS = 40;
const MAX_METADATA_STRING = 500;

export type SanitizedMetadata = Record<string, unknown>;

/** Provider responses are never persisted verbatim; keep only bounded, safe metadata. */
export function sanitizeAdvertisingMetadata(value: unknown, depth = 0): SanitizedMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 3) return {};
  const output: SanitizedMetadata = {};
  for (const [key, child] of Object.entries(value).slice(0, MAX_METADATA_KEYS)) {
    if (BLOCKED_METADATA_KEYS.test(key)) continue;
    if (typeof child === "string") output[key] = child.slice(0, MAX_METADATA_STRING);
    else if (typeof child === "number" || typeof child === "boolean" || child === null)
      output[key] = child;
    else if (Array.isArray(child)) {
      output[key] = child
        .slice(0, 20)
        .map((item) =>
          typeof item === "string"
            ? item.slice(0, MAX_METADATA_STRING)
            : sanitizeAdvertisingMetadata(item, depth + 1),
        );
    } else output[key] = sanitizeAdvertisingMetadata(child, depth + 1);
  }
  return output;
}

export class AdvertisingConnectionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdvertisingConnectionInputError";
  }
}

export async function createAdvertisingConnection(
  db: Db,
  args: {
    agencyId: string;
    provider: AdvertisingProvider;
    displayName: string;
    appId?: string | null | undefined;
    graphApiVersion?: string | null | undefined;
    actorId?: string | undefined;
  },
) {
  if (args.provider !== "meta")
    throw new AdvertisingConnectionInputError("unsupported_advertising_provider");
  // Agency-owned OAuth is intentionally not enabled in the first release.
  const credentialRef = `advertising:${randomUUID()}`;
  const inserted = await db
    .insert(advertisingConnections)
    .values({
      agencyId: args.agencyId,
      provider: args.provider,
      ownerType: "platform",
      displayName: args.displayName.trim().slice(0, 120),
      status: "invalid",
      credentialRef,
      appId: args.appId ?? null,
      graphApiVersion: args.graphApiVersion ?? null,
      createdBy: args.actorId,
    })
    .returning({
      id: advertisingConnections.id,
      credentialRef: advertisingConnections.credentialRef,
    });
  const row = inserted[0];
  if (!row) throw new Error("Advertising connection was not created");
  await db.insert(advertisingConnectionAgencyAccess).values({
    connectionId: row.id,
    agencyId: args.agencyId,
    grantedBy: args.actorId,
  });
  return row;
}

/**
 * Change the pinned Graph API version without touching the encrypted
 * credential. A version change invalidates the connection and fences every
 * scheduled/in-flight sync until the new version is validated explicitly.
 */
export async function updateAdvertisingGraphApiVersion(
  db: Db,
  args: {
    agencyId: string;
    connectionId: string;
    graphApiVersion: string;
    actorId: string;
  },
) {
  if (!/^v\d+\.\d+$/.test(args.graphApiVersion))
    throw new AdvertisingConnectionInputError("invalid_graph_api_version");

  return db.transaction(async (tx) => {
    const connection = (
      await tx
        .select({
          id: advertisingConnections.id,
          status: advertisingConnections.status,
        })
        .from(advertisingConnections)
        .where(
          and(
            eq(advertisingConnections.id, args.connectionId),
            eq(advertisingConnections.agencyId, args.agencyId),
          ),
        )
        .limit(1)
    )[0];
    if (!connection) throw new AdvertisingConnectionInputError("advertising_connection_not_found");
    if (connection.status === "revoked")
      throw new AdvertisingConnectionInputError("advertising_connection_revoked");

    const now = new Date();
    const [updated] = await tx
      .update(advertisingConnections)
      .set({
        graphApiVersion: args.graphApiVersion,
        status: "invalid",
        lastValidatedAt: null,
        lastValidationStatus: null,
        lastValidationCode: null,
        updatedAt: now,
      })
      .where(eq(advertisingConnections.id, args.connectionId))
      .returning({ id: advertisingConnections.id });
    if (!updated) throw new AdvertisingConnectionInputError("advertising_connection_not_found");

    await tx
      .update(advertisingSyncStates)
      .set({
        status: "paused",
        nextRunAt: null,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(advertisingSyncStates.connectionId, args.connectionId));

    await tx.insert(securityAuditEvents).values({
      actorId: args.actorId,
      action: "advertising.connection.graph_version_updated",
      targetType: "advertising_connection",
      targetId: args.connectionId,
      outcome: "success",
      metadata: {
        agencyId: args.agencyId,
        connectionId: args.connectionId,
        graphApiVersion: args.graphApiVersion,
        status: "invalid",
      },
    });
    return { connectionId: updated.id, graphApiVersion: args.graphApiVersion } as const;
  });
}

/** Grant a platform-owned connection to a customer agency without moving its secret. */
export async function grantAdvertisingConnectionAgency(
  db: Db,
  args: { connectionId: string; agencyId: string; grantedBy?: string | undefined },
) {
  const connection = (
    await db
      .select({
        ownerType: advertisingConnections.ownerType,
        status: advertisingConnections.status,
      })
      .from(advertisingConnections)
      .where(eq(advertisingConnections.id, args.connectionId))
      .limit(1)
  )[0];
  if (!connection || connection.ownerType !== "platform" || connection.status === "revoked")
    throw new AdvertisingConnectionInputError("advertising_platform_connection_not_available");
  const [access] = await db
    .insert(advertisingConnectionAgencyAccess)
    .values({ connectionId: args.connectionId, agencyId: args.agencyId, grantedBy: args.grantedBy })
    .onConflictDoUpdate({
      target: [
        advertisingConnectionAgencyAccess.connectionId,
        advertisingConnectionAgencyAccess.agencyId,
      ],
      set: { status: "active", revokedAt: null, grantedBy: args.grantedBy, updatedAt: new Date() },
    })
    .returning();
  if (!access) throw new Error("Advertising connection agency access was not persisted");
  return access;
}

export async function persistDiscoveredAdvertisingAccount(
  db: Db,
  args: {
    agencyId: string;
    connectionId: string;
    externalAccountId: string;
    name: string;
    currency?: string | null | undefined;
    timezone?: string | null | undefined;
    metadata?: unknown;
  },
) {
  const connection = (
    await db
      .select({
        id: advertisingConnections.id,
        provider: advertisingConnections.provider,
        agencyId: advertisingConnections.agencyId,
        ownerType: advertisingConnections.ownerType,
      })
      .from(advertisingConnections)
      .where(
        and(
          eq(advertisingConnections.id, args.connectionId),
          eq(advertisingConnections.status, "active"),
        ),
      )
      .limit(1)
  )[0];
  if (!connection) throw new AdvertisingConnectionInputError("advertising_connection_not_active");
  if (connection.agencyId !== args.agencyId) {
    if (connection.ownerType !== "platform")
      throw new AdvertisingConnectionInputError("advertising_connection_not_authorized");
    const [access] = await db
      .select({ id: advertisingConnectionAgencyAccess.id })
      .from(advertisingConnectionAgencyAccess)
      .where(
        and(
          eq(advertisingConnectionAgencyAccess.connectionId, args.connectionId),
          eq(advertisingConnectionAgencyAccess.agencyId, args.agencyId),
          eq(advertisingConnectionAgencyAccess.status, "active"),
        ),
      )
      .limit(1);
    if (!access) throw new AdvertisingConnectionInputError("advertising_connection_not_authorized");
  }

  return db.transaction(async (tx) => {
    const [identity] = await tx
      .insert(advertisingProviderAccountIdentities)
      .values({
        provider: connection.provider,
        externalAccountId: args.externalAccountId,
        name: args.name.trim().slice(0, 200),
        currency: args.currency?.trim().slice(0, 12) ?? null,
        timezone: args.timezone?.trim().slice(0, 80) ?? null,
        status: "active",
        metadata: sanitizeAdvertisingMetadata(args.metadata),
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          advertisingProviderAccountIdentities.provider,
          advertisingProviderAccountIdentities.externalAccountId,
        ],
        set: {
          name: args.name.trim().slice(0, 200),
          currency: args.currency?.trim().slice(0, 12) ?? null,
          timezone: args.timezone?.trim().slice(0, 80) ?? null,
          status: "active",
          metadata: sanitizeAdvertisingMetadata(args.metadata),
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!identity) throw new Error("Advertising provider identity was not persisted");
    const [account] = await tx
      .insert(advertisingAccounts)
      .values({
        agencyId: args.agencyId,
        identityId: identity.id,
        provider: connection.provider,
        externalAccountId: args.externalAccountId,
        name: args.name.trim().slice(0, 200),
        currency: args.currency?.trim().slice(0, 12) ?? null,
        timezone: args.timezone?.trim().slice(0, 80) ?? null,
        status: "active",
        metadata: sanitizeAdvertisingMetadata(args.metadata),
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          advertisingAccounts.agencyId,
          advertisingAccounts.provider,
          advertisingAccounts.externalAccountId,
        ],
        set: {
          name: args.name.trim().slice(0, 200),
          identityId: identity.id,
          currency: args.currency?.trim().slice(0, 12) ?? null,
          timezone: args.timezone?.trim().slice(0, 80) ?? null,
          status: "active",
          metadata: sanitizeAdvertisingMetadata(args.metadata),
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!account) throw new Error("Advertising account was not persisted");
    await tx
      .insert(advertisingConnectionAccounts)
      .values({
        connectionId: args.connectionId,
        accountId: account.id,
        status: "active",
        lastVerifiedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          advertisingConnectionAccounts.connectionId,
          advertisingConnectionAccounts.accountId,
        ],
        set: { status: "active", lastVerifiedAt: new Date(), updatedAt: new Date() },
      });
    return account;
  });
}

export type AdvertisingProviderObjectType = "campaign" | "adset" | "ad" | "creative";

function providerObjectRows(value: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value) && Array.isArray(value.data)) return value.data.filter(isRecord);
  if (isRecord(value) && typeof value.id === "string") return [value];
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedText(value: unknown, max = 500): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function decimalText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^\d+(?:\.\d{1,6})?$/.test(value)) return value;
  return null;
}

function promotedPostId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  for (const key of [
    "promoted_object",
    "creative",
    "object_story_spec",
    "link_data",
    "video_data",
  ]) {
    const child = value[key];
    if (isRecord(child)) {
      const direct = boundedText(child.post_id) ?? boundedText(child.story_id);
      if (direct) return direct;
      const nested = promotedPostId(child);
      if (nested) return nested;
    }
  }
  return boundedText(value.post_id) ?? boundedText(value.story_id);
}

function postAssociationStatus(
  value: Record<string, unknown>,
  postId: string | null,
): "linked" | "unresolved" | "unsupported" | "unpublished" {
  if (postId) return "linked";
  if (value.is_published === false || value.published === false) return "unpublished";
  if (value.post_linking_supported === false) return "unsupported";
  return "unresolved";
}

/** Persist only bounded, non-secret provider object fields for analytics. */
export async function persistAdvertisingProviderObjects(
  db: Db,
  args: {
    agencyId: string;
    accountId: string;
    connectionId: string;
    syncRunId?: string | null | undefined;
    objectType: AdvertisingProviderObjectType;
    rows: unknown;
    parentExternalObjectId?: string | null | undefined;
  },
) {
  const [link] = await db
    .select({
      accountId: advertisingConnectionAccounts.accountId,
      connectionAgencyId: advertisingConnections.agencyId,
      ownerType: advertisingConnections.ownerType,
    })
    .from(advertisingConnectionAccounts)
    .innerJoin(
      advertisingConnections,
      and(
        eq(advertisingConnections.id, advertisingConnectionAccounts.connectionId),
        eq(advertisingConnections.status, "active"),
      ),
    )
    .where(
      and(
        eq(advertisingConnectionAccounts.connectionId, args.connectionId),
        eq(advertisingConnectionAccounts.accountId, args.accountId),
        eq(advertisingConnectionAccounts.status, "active"),
      ),
    )
    .limit(1);
  if (!link) throw new AdvertisingConnectionInputError("advertising_connection_account_not_active");
  if (link.connectionAgencyId !== args.agencyId) {
    if (link.ownerType !== "platform")
      throw new AdvertisingConnectionInputError("advertising_connection_account_not_active");
    const [access] = await db
      .select({ id: advertisingConnectionAgencyAccess.id })
      .from(advertisingConnectionAgencyAccess)
      .where(
        and(
          eq(advertisingConnectionAgencyAccess.connectionId, args.connectionId),
          eq(advertisingConnectionAgencyAccess.agencyId, args.agencyId),
          eq(advertisingConnectionAgencyAccess.status, "active"),
        ),
      )
      .limit(1);
    if (!access)
      throw new AdvertisingConnectionInputError("advertising_connection_account_not_active");
  }

  const values = providerObjectRows(args.rows).flatMap((row) => {
    const externalObjectId = boundedText(row.id, 200);
    if (!externalObjectId) return [];
    const resolvedPostId = promotedPostId(row);
    return [
      {
        agencyId: args.agencyId,
        accountId: args.accountId,
        connectionId: args.connectionId,
        syncRunId: args.syncRunId ?? null,
        objectType: args.objectType,
        externalObjectId,
        parentExternalObjectId: args.parentExternalObjectId ?? null,
        name: boundedText(row.name, 200),
        status: boundedText(row.status, 80),
        objective: boundedText(row.objective, 120),
        dailyBudget: decimalText(row.daily_budget),
        lifetimeBudget: decimalText(row.lifetime_budget),
        promotedPostId: resolvedPostId,
        postAssociationStatus: postAssociationStatus(row, resolvedPostId),
        metadata: sanitizeAdvertisingMetadata({
          ...(row.creative ? { creative: row.creative } : {}),
          ...(row.effective_status ? { effective_status: row.effective_status } : {}),
          ...(row.targeting ? { targeting: row.targeting } : {}),
        }),
        observedAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  });
  if (values.length === 0) return { written: 0 };
  const inserted = await db
    .insert(advertisingProviderObjects)
    .values(values)
    .onConflictDoUpdate({
      target: [
        advertisingProviderObjects.agencyId,
        advertisingProviderObjects.accountId,
        advertisingProviderObjects.objectType,
        advertisingProviderObjects.externalObjectId,
      ],
      set: {
        connectionId: args.connectionId,
        syncRunId: args.syncRunId ?? null,
        parentExternalObjectId: sql`excluded.parent_external_object_id`,
        name: sql`excluded.name`,
        status: sql`excluded.status`,
        objective: sql`excluded.objective`,
        dailyBudget: sql`excluded.daily_budget`,
        lifetimeBudget: sql`excluded.lifetime_budget`,
        promotedPostId: sql`coalesce(excluded.promoted_post_id, ${advertisingProviderObjects.promotedPostId})`,
        postAssociationStatus: sql`CASE WHEN excluded.promoted_post_id IS NULL THEN ${advertisingProviderObjects.postAssociationStatus} ELSE excluded.post_association_status END`,
        metadata: sql`excluded.metadata`,
        observedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning({ id: advertisingProviderObjects.id });
  return { written: inserted.length };
}

export async function recordAdvertisingValidation(
  db: Db,
  args: {
    connectionId: string;
    accountId?: string | null | undefined;
    operation: string;
    status: "passed" | "failed" | "partial" | "unavailable";
    sanitizedCode?: string | null | undefined;
    providerRequestId?: string | null | undefined;
    retryable?: boolean | undefined;
    metadata?: unknown;
  },
) {
  const [result] = await db
    .insert(advertisingValidationResults)
    .values({
      connectionId: args.connectionId,
      accountId: args.accountId ?? null,
      operation: args.operation,
      status: args.status,
      sanitizedCode: args.sanitizedCode?.slice(0, 120) ?? null,
      providerRequestId: args.providerRequestId?.slice(0, 200) ?? null,
      retryable: args.retryable ?? false,
      metadata: sanitizeAdvertisingMetadata(args.metadata),
    })
    .returning({ id: advertisingValidationResults.id });
  if (!result) throw new Error("Advertising validation result was not recorded");
  await db
    .update(advertisingConnections)
    .set({
      lastValidatedAt: new Date(),
      lastValidationStatus:
        args.status === "passed" ? "passed" : args.status === "partial" ? "partial" : "failed",
      lastValidationCode: args.sanitizedCode?.slice(0, 120) ?? null,
      updatedAt: new Date(),
    })
    .where(eq(advertisingConnections.id, args.connectionId));
  return result;
}

export async function setAdvertisingCapability(
  db: Db,
  args: {
    connectionId: string;
    accountId: string;
    capability: AdvertisingCapability;
    status: "available" | "unavailable" | "partial" | "unknown";
    validationResultId?: string | null | undefined;
  },
) {
  const [row] = await db
    .insert(advertisingCapabilities)
    .values({
      connectionId: args.connectionId,
      accountId: args.accountId,
      capability: args.capability,
      status: args.status,
      lastValidationResultId: args.validationResultId ?? null,
      checkedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        advertisingCapabilities.connectionId,
        advertisingCapabilities.accountId,
        advertisingCapabilities.capability,
      ],
      set: {
        status: args.status,
        checkedAt: new Date(),
        lastValidationResultId: args.validationResultId ?? null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: advertisingCapabilities.id });
  if (!row) throw new Error("Advertising capability was not persisted");
  return row;
}

export type AdvertisingSocialIdentityType = "facebook_page" | "instagram_business";

/**
 * Persist only the stable, sanitized identity fields returned by a Meta
 * read-only probe. Provider payloads and page/Instagram access tokens never
 * cross this boundary.
 */
export async function persistDiscoveredAdvertisingSocialIdentity(
  db: Db,
  args: {
    agencyId: string;
    connectionId: string;
    accountId?: string | null | undefined;
    identityType: AdvertisingSocialIdentityType;
    externalIdentityId: string;
    displayName?: string | null | undefined;
    username?: string | null | undefined;
    parentExternalIdentityId?: string | null | undefined;
    metadata?: unknown;
  },
) {
  const [connection] = await db
    .select({ id: advertisingConnections.id, provider: advertisingConnections.provider })
    .from(advertisingConnections)
    .where(
      and(
        eq(advertisingConnections.id, args.connectionId),
        eq(advertisingConnections.agencyId, args.agencyId),
        eq(advertisingConnections.status, "active"),
      ),
    )
    .limit(1);
  if (!connection) throw new AdvertisingConnectionInputError("advertising_connection_not_active");

  const [identity] = await db
    .insert(advertisingSocialIdentities)
    .values({
      agencyId: args.agencyId,
      connectionId: args.connectionId,
      accountId: args.accountId ?? null,
      provider: connection.provider,
      identityType: args.identityType,
      externalIdentityId: args.externalIdentityId.trim().slice(0, 200),
      displayName: args.displayName?.trim().slice(0, 200) || null,
      username: args.username?.trim().slice(0, 200) || null,
      parentExternalIdentityId: args.parentExternalIdentityId?.trim().slice(0, 200) || null,
      status: "active",
      metadata: sanitizeAdvertisingMetadata(args.metadata),
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        advertisingSocialIdentities.agencyId,
        advertisingSocialIdentities.provider,
        advertisingSocialIdentities.identityType,
        advertisingSocialIdentities.externalIdentityId,
      ],
      set: {
        connectionId: args.connectionId,
        accountId: args.accountId ?? null,
        displayName: args.displayName?.trim().slice(0, 200) || null,
        username: args.username?.trim().slice(0, 200) || null,
        parentExternalIdentityId: args.parentExternalIdentityId?.trim().slice(0, 200) || null,
        status: "active",
        metadata: sanitizeAdvertisingMetadata(args.metadata),
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning({ id: advertisingSocialIdentities.id });
  if (!identity) throw new Error("Advertising social identity was not persisted");
  return identity;
}

/** Activate only after the credential identity probe has passed. */
export async function activateAdvertisingConnection(
  db: Db,
  args: { agencyId: string; connectionId: string },
) {
  const [connection] = await db
    .update(advertisingConnections)
    .set({ status: "active", revokedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(advertisingConnections.id, args.connectionId),
        eq(advertisingConnections.agencyId, args.agencyId),
        ne(advertisingConnections.status, "revoked"),
        gt(advertisingConnections.currentCredentialVersion, 0),
      ),
    )
    .returning({ id: advertisingConnections.id, status: advertisingConnections.status });
  if (!connection) throw new AdvertisingConnectionInputError("advertising_connection_not_found");
  return connection;
}
