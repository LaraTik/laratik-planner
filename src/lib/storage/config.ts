import "server-only";
import { and, count, desc, eq, inArray, sum } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db } from "@/lib/db";
import {
  agencyStorageConfigs,
  agencyUsageCounters,
  platformAuditEvents,
  platformStorageProviderConfigs,
  storageObjects,
  storageUploadIntents,
} from "@/lib/db/schema";
import { requirePlatformPermission } from "@/lib/auth/platform-access";
import { isAgencyAdmin } from "@/lib/auth/policy";
import type { Actor } from "@/lib/auth/policy";
import { decryptSecret, encryptSecret } from "@/lib/security/secrets";
import { getLimitForResource } from "@/lib/usage/get-limit-for-resource";
import { AgencyOwnedR2ConfigSchema, R2ConfigSchema, type R2Config } from "./r2-config";
import { R2ObjectStorageAdapter, StorageConfigurationError } from "./r2-adapter";

function decodeSecret(ciphertext: string, keyVersion: number): string {
  return decryptSecret(Buffer.from(ciphertext, "base64"), keyVersion);
}

function toR2Config(row: {
  accountId: string;
  endpoint: string;
  bucket: string;
  accessKeyCiphertext: string;
  accessKeyKeyVersion: number;
  secretAccessKeyCiphertext: string;
  secretAccessKeyKeyVersion: number;
  storageClass: string;
}): R2Config {
  return R2ConfigSchema.parse({
    accountId: row.accountId,
    endpoint: row.endpoint,
    bucket: row.bucket,
    accessKeyId: decodeSecret(row.accessKeyCiphertext, row.accessKeyKeyVersion),
    secretAccessKey: decodeSecret(row.secretAccessKeyCiphertext, row.secretAccessKeyKeyVersion),
    storageClass: row.storageClass,
  });
}

function toAgencyOwnedR2Config(row: {
  accountId: string | null;
  bucketOverride: string | null;
  endpointOverride: string | null;
  accessKeyCiphertext: string | null;
  accessKeyKeyVersion: number | null;
  secretAccessKeyCiphertext: string | null;
  secretAccessKeyKeyVersion: number | null;
}): R2Config {
  if (
    !row.accountId ||
    !row.bucketOverride ||
    !row.endpointOverride ||
    !row.accessKeyCiphertext ||
    row.accessKeyKeyVersion == null ||
    !row.secretAccessKeyCiphertext ||
    row.secretAccessKeyKeyVersion == null
  ) {
    throw new StorageConfigurationError("Agency-owned storage credentials are incomplete");
  }
  try {
    return AgencyOwnedR2ConfigSchema.parse({
      accountId: row.accountId,
      endpoint: row.endpointOverride,
      bucket: row.bucketOverride,
      accessKeyId: decodeSecret(row.accessKeyCiphertext, row.accessKeyKeyVersion),
      secretAccessKey: decodeSecret(row.secretAccessKeyCiphertext, row.secretAccessKeyKeyVersion),
      storageClass: "standard",
    });
  } catch {
    throw new StorageConfigurationError("Agency-owned storage credentials are invalid");
  }
}

function isBackendChangeBlocked(objectCount: number, intentCount: number): boolean {
  return objectCount > 0 || intentCount > 0;
}

async function requireAgencyStorageAdmin(actor: Actor, agencyId: string): Promise<void> {
  if (!(await isAgencyAdmin(actor, agencyId))) {
    throw new StorageConfigurationError("Agency administrator permission is required");
  }
}

export async function testR2Connection(rawInput: unknown): Promise<void> {
  const config = R2ConfigSchema.parse(rawInput);
  const adapter = new R2ObjectStorageAdapter(config);
  await adapter.testConnection();
}

/** Test a tenant-owned credential pair without persisting it. */
export async function testAgencyOwnedR2Connection(rawInput: unknown): Promise<void> {
  const config = AgencyOwnedR2ConfigSchema.parse(rawInput);
  const adapter = new R2ObjectStorageAdapter(config);
  await adapter.testConnection();
}

export async function saveManagedR2Config(actor: Actor, rawInput: unknown) {
  await requirePlatformPermission(actor, "platform.console.manage");
  const input = AgencyOwnedR2ConfigSchema.parse(rawInput);
  // Rotation is a two-phase operation: prove the new credential can perform
  // the probe before replacing the active encrypted credential in PostgreSQL.
  await testR2Connection(input);
  const accessKey = encryptSecret(input.accessKeyId);
  const secretKey = encryptSecret(input.secretAccessKey);

  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select({
        id: platformStorageProviderConfigs.id,
        status: platformStorageProviderConfigs.status,
      })
      .from(platformStorageProviderConfigs)
      .where(eq(platformStorageProviderConfigs.provider, "r2"))
      .limit(1);

    const [saved] = await tx
      .insert(platformStorageProviderConfigs)
      .values({
        provider: "r2",
        accountId: input.accountId,
        endpoint: input.endpoint,
        bucket: input.bucket,
        accessKeyCiphertext: accessKey.ciphertext.toString("base64"),
        accessKeyLastFour: accessKey.lastFour,
        accessKeyKeyVersion: accessKey.keyVersion,
        secretAccessKeyCiphertext: secretKey.ciphertext.toString("base64"),
        secretAccessKeyLastFour: secretKey.lastFour,
        secretAccessKeyKeyVersion: secretKey.keyVersion,
        storageClass: input.storageClass,
        enabled: true,
        status: "healthy",
        lastTestedAt: new Date(),
        lastTestedOk: true,
        configuredBy: actor.id,
      })
      .onConflictDoUpdate({
        target: platformStorageProviderConfigs.provider,
        set: {
          accountId: input.accountId,
          endpoint: input.endpoint,
          bucket: input.bucket,
          accessKeyCiphertext: accessKey.ciphertext.toString("base64"),
          accessKeyLastFour: accessKey.lastFour,
          accessKeyKeyVersion: accessKey.keyVersion,
          secretAccessKeyCiphertext: secretKey.ciphertext.toString("base64"),
          secretAccessKeyLastFour: secretKey.lastFour,
          secretAccessKeyKeyVersion: secretKey.keyVersion,
          storageClass: input.storageClass,
          enabled: true,
          status: "healthy",
          lastTestedAt: new Date(),
          lastTestedOk: true,
          lastErrorCode: null,
          configuredBy: actor.id,
          updatedAt: new Date(),
        },
      })
      .returning({ id: platformStorageProviderConfigs.id });

    if (!saved) throw new Error("Managed storage configuration could not be saved");
    await tx.insert(platformAuditEvents).values({
      actorUserId: actor.id,
      action: previous ? "storage.provider.update" : "storage.provider.create",
      target: { type: "storage_provider", id: saved.id },
      before: previous ? { status: previous.status } : null,
      after: {
        provider: "r2",
        accountId: input.accountId,
        bucket: input.bucket,
        endpointHost: new URL(input.endpoint).host,
        storageClass: input.storageClass,
        credentialsRotated: true,
      },
    });
    return saved;
  });
}

/**
 * Save a Cloudflare R2 account supplied by an agency administrator. The
 * credential probe happens before the encrypted values enter PostgreSQL.
 * Switching the physical backend is blocked once objects or active intents
 * exist; a separate migration is required so existing media cannot become
 * unreadable by accident.
 */
export async function saveAgencyOwnedR2Config(actor: Actor, agencyId: string, rawInput: unknown) {
  await requireAgencyStorageAdmin(actor, agencyId);
  const input = R2ConfigSchema.parse(rawInput);
  await testAgencyOwnedR2Connection(input);

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        mode: agencyStorageConfigs.mode,
        accountId: agencyStorageConfigs.accountId,
        bucketOverride: agencyStorageConfigs.bucketOverride,
        endpointOverride: agencyStorageConfigs.endpointOverride,
        keyPrefix: agencyStorageConfigs.keyPrefix,
      })
      .from(agencyStorageConfigs)
      .where(eq(agencyStorageConfigs.agencyId, agencyId))
      .limit(1);
    const [[objects], [intents]] = await Promise.all([
      tx
        .select({ value: count() })
        .from(storageObjects)
        .where(
          and(
            eq(storageObjects.agencyId, agencyId),
            inArray(storageObjects.status, ["pending", "active", "soft_deleted"]),
          ),
        ),
      tx
        .select({ value: count() })
        .from(storageUploadIntents)
        .where(
          and(
            eq(storageUploadIntents.agencyId, agencyId),
            inArray(storageUploadIntents.status, ["reserved", "uploaded"]),
          ),
        ),
    ]);
    const objectCount = Number(objects?.value ?? 0);
    const intentCount = Number(intents?.value ?? 0);
    const backendChanged =
      current?.mode !== "agency_owned" ||
      current.accountId !== input.accountId ||
      current.bucketOverride !== input.bucket ||
      current.endpointOverride !== input.endpoint;
    if (backendChanged && isBackendChangeBlocked(objectCount, intentCount)) {
      throw new StorageConfigurationError(
        "Changing storage backends requires a storage migration before existing objects can move",
      );
    }

    const accessKey = encryptSecret(input.accessKeyId);
    const secretKey = encryptSecret(input.secretAccessKey);
    const now = new Date();
    const [saved] = await tx
      .insert(agencyStorageConfigs)
      .values({
        agencyId,
        mode: "agency_owned",
        provider: "r2",
        keyPrefix: current?.keyPrefix ?? `agencies/${agencyId}`,
        accountId: input.accountId,
        bucketOverride: input.bucket,
        endpointOverride: input.endpoint,
        accessKeyCiphertext: accessKey.ciphertext.toString("base64"),
        accessKeyLastFour: accessKey.lastFour,
        accessKeyKeyVersion: accessKey.keyVersion,
        secretAccessKeyCiphertext: secretKey.ciphertext.toString("base64"),
        secretAccessKeyLastFour: secretKey.lastFour,
        secretAccessKeyKeyVersion: secretKey.keyVersion,
        enabled: true,
        status: "healthy",
        lastHealthCheckAt: now,
        lastHealthCheckOk: true,
        lastErrorCode: null,
        configuredBy: actor.id,
      })
      .onConflictDoUpdate({
        target: agencyStorageConfigs.agencyId,
        set: {
          mode: "agency_owned",
          provider: "r2",
          accountId: input.accountId,
          bucketOverride: input.bucket,
          endpointOverride: input.endpoint,
          accessKeyCiphertext: accessKey.ciphertext.toString("base64"),
          accessKeyLastFour: accessKey.lastFour,
          accessKeyKeyVersion: accessKey.keyVersion,
          secretAccessKeyCiphertext: secretKey.ciphertext.toString("base64"),
          secretAccessKeyLastFour: secretKey.lastFour,
          secretAccessKeyKeyVersion: secretKey.keyVersion,
          enabled: true,
          status: "healthy",
          lastHealthCheckAt: now,
          lastHealthCheckOk: true,
          lastErrorCode: null,
          configuredBy: actor.id,
          updatedAt: now,
        },
      })
      .returning({ agencyId: agencyStorageConfigs.agencyId, mode: agencyStorageConfigs.mode });
    if (!saved) {
      throw new StorageConfigurationError("Agency storage configuration could not be saved");
    }

    await tx.insert(platformAuditEvents).values({
      actorUserId: actor.id,
      action: "storage.agency.configure",
      target: { type: "agency_storage", id: agencyId },
      before: current
        ? {
            mode: current.mode,
            accountId: current.accountId,
            bucket: current.bucketOverride,
            endpointHost: current.endpointOverride ? new URL(current.endpointOverride).host : null,
          }
        : null,
      after: {
        mode: "agency_owned",
        accountId: input.accountId,
        bucket: input.bucket,
        endpointHost: new URL(input.endpoint).host,
        credentialsRotated: true,
      },
    });
    return saved;
  });
}

/** Return an empty agency to the platform-managed backend safely. */
export async function switchAgencyToManagedStorage(actor: Actor, agencyId: string) {
  await requireAgencyStorageAdmin(actor, agencyId);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ mode: agencyStorageConfigs.mode, keyPrefix: agencyStorageConfigs.keyPrefix })
      .from(agencyStorageConfigs)
      .where(eq(agencyStorageConfigs.agencyId, agencyId))
      .limit(1);
    const [[objects], [intents]] = await Promise.all([
      tx
        .select({ value: count() })
        .from(storageObjects)
        .where(
          and(
            eq(storageObjects.agencyId, agencyId),
            inArray(storageObjects.status, ["pending", "active", "soft_deleted"]),
          ),
        ),
      tx
        .select({ value: count() })
        .from(storageUploadIntents)
        .where(
          and(
            eq(storageUploadIntents.agencyId, agencyId),
            inArray(storageUploadIntents.status, ["reserved", "uploaded"]),
          ),
        ),
    ]);
    if (isBackendChangeBlocked(Number(objects?.value ?? 0), Number(intents?.value ?? 0))) {
      throw new StorageConfigurationError(
        "Changing storage backends requires a storage migration before existing objects can move",
      );
    }
    const now = new Date();
    if (current) {
      await tx
        .update(agencyStorageConfigs)
        .set({
          mode: "managed",
          accountId: null,
          bucketOverride: null,
          endpointOverride: null,
          accessKeyCiphertext: null,
          accessKeyLastFour: null,
          accessKeyKeyVersion: null,
          secretAccessKeyCiphertext: null,
          secretAccessKeyLastFour: null,
          secretAccessKeyKeyVersion: null,
          status: "pending",
          lastHealthCheckAt: null,
          lastHealthCheckOk: null,
          lastErrorCode: null,
          configuredBy: actor.id,
          updatedAt: now,
        })
        .where(eq(agencyStorageConfigs.agencyId, agencyId));
    } else {
      await tx.insert(agencyStorageConfigs).values({
        agencyId,
        mode: "managed",
        keyPrefix: `agencies/${agencyId}`,
        enabled: true,
        status: "pending",
        configuredBy: actor.id,
      });
    }
    await tx.insert(platformAuditEvents).values({
      actorUserId: actor.id,
      action: "storage.agency.mode_change",
      target: { type: "agency_storage", id: agencyId },
      before: current ? { mode: current.mode } : null,
      after: { mode: "managed" },
    });
    return { agencyId, mode: "managed" as const };
  });
}

export async function getAgencyStorageContext(agencyId: string, database: NodePgDatabase = db) {
  const [agencyConfig] = await database
    .select()
    .from(agencyStorageConfigs)
    .where(eq(agencyStorageConfigs.agencyId, agencyId))
    .limit(1);
  if (!agencyConfig || !agencyConfig.enabled || agencyConfig.status === "disabled") {
    throw new StorageConfigurationError("Agency storage is disabled");
  }

  if (agencyConfig.mode === "agency_owned") {
    const owned = toAgencyOwnedR2Config(agencyConfig);
    return {
      adapter: new R2ObjectStorageAdapter(owned),
      bucket: owned.bucket,
      keyPrefix: agencyConfig.keyPrefix,
      mode: "agency_owned" as const,
    };
  }
  if (agencyConfig.mode !== "managed") {
    throw new StorageConfigurationError("Agency storage mode is invalid");
  }

  const [platformConfig] = await database
    .select()
    .from(platformStorageProviderConfigs)
    .where(
      and(
        eq(platformStorageProviderConfigs.provider, "r2"),
        eq(platformStorageProviderConfigs.enabled, true),
      ),
    )
    .orderBy(desc(platformStorageProviderConfigs.updatedAt))
    .limit(1);
  if (!platformConfig || platformConfig.status !== "healthy") {
    throw new StorageConfigurationError("Managed storage provider is not healthy");
  }

  const base = toR2Config(platformConfig);
  if (
    agencyConfig.endpointOverride &&
    agencyConfig.endpointOverride.replace(/\/+$/, "") !== base.endpoint
  ) {
    throw new StorageConfigurationError(
      "Managed storage cannot use a different agency endpoint; configure agency-owned R2 instead",
    );
  }
  const bucket = agencyConfig.bucketOverride ?? base.bucket;
  const adapter = new R2ObjectStorageAdapter({ ...base, bucket });
  return {
    adapter,
    bucket,
    keyPrefix: agencyConfig.keyPrefix,
    mode: "managed" as const,
  };
}

export async function getAgencyStorageAdapter(agencyId: string, database: NodePgDatabase = db) {
  return (await getAgencyStorageContext(agencyId, database)).adapter;
}

/**
 * Run a health probe using the already-configured, database-resolved
 * provider and persist only the result code. The caller is responsible for
 * authorization; this helper never accepts credentials from the browser.
 */
export async function testAgencyStorageConnection(
  agencyId: string,
  database: NodePgDatabase = db,
): Promise<{ ok: true } | { ok: false }> {
  const checkedAt = new Date();
  try {
    const { adapter } = await getAgencyStorageContext(agencyId, database);
    await adapter.testConnection();
    await database
      .update(agencyStorageConfigs)
      .set({
        status: "healthy",
        lastHealthCheckAt: checkedAt,
        lastHealthCheckOk: true,
        lastErrorCode: null,
        updatedAt: checkedAt,
      })
      .where(eq(agencyStorageConfigs.agencyId, agencyId));
    return { ok: true };
  } catch {
    // Deliberately persist a stable code, never a provider error or secret.
    await database
      .update(agencyStorageConfigs)
      .set({
        status: "unhealthy",
        lastHealthCheckAt: checkedAt,
        lastHealthCheckOk: false,
        lastErrorCode: "connection_test_failed",
        updatedAt: checkedAt,
      })
      .where(eq(agencyStorageConfigs.agencyId, agencyId));
    return { ok: false };
  }
}

export async function getAgencyStorageSummary(agencyId: string, database: NodePgDatabase = db) {
  const [[config], [provider], [counter], [reserved], [objects], [activeIntents]] =
    await Promise.all([
      database
        .select({
          enabled: agencyStorageConfigs.enabled,
          status: agencyStorageConfigs.status,
          mode: agencyStorageConfigs.mode,
          keyPrefix: agencyStorageConfigs.keyPrefix,
          accountId: agencyStorageConfigs.accountId,
          bucketOverride: agencyStorageConfigs.bucketOverride,
          endpointOverride: agencyStorageConfigs.endpointOverride,
          accessKeyLastFour: agencyStorageConfigs.accessKeyLastFour,
          secretAccessKeyLastFour: agencyStorageConfigs.secretAccessKeyLastFour,
          lastHealthCheckAt: agencyStorageConfigs.lastHealthCheckAt,
          lastHealthCheckOk: agencyStorageConfigs.lastHealthCheckOk,
        })
        .from(agencyStorageConfigs)
        .where(eq(agencyStorageConfigs.agencyId, agencyId))
        .limit(1),
      database
        .select({
          enabled: platformStorageProviderConfigs.enabled,
          status: platformStorageProviderConfigs.status,
        })
        .from(platformStorageProviderConfigs)
        .where(eq(platformStorageProviderConfigs.provider, "r2"))
        .orderBy(desc(platformStorageProviderConfigs.updatedAt))
        .limit(1),
      database
        .select({ currentValue: agencyUsageCounters.currentValue })
        .from(agencyUsageCounters)
        .where(
          and(
            eq(agencyUsageCounters.agencyId, agencyId),
            eq(agencyUsageCounters.resourceKey, "storage_bytes"),
          ),
        )
        .limit(1),
      database
        .select({ value: sum(storageUploadIntents.reservedByteSize) })
        .from(storageUploadIntents)
        .where(
          and(
            eq(storageUploadIntents.agencyId, agencyId),
            inArray(storageUploadIntents.status, ["reserved", "uploaded"]),
          ),
        ),
      database
        .select({ value: count() })
        .from(storageObjects)
        .where(and(eq(storageObjects.agencyId, agencyId), eq(storageObjects.status, "active"))),
      database
        .select({ value: count() })
        .from(storageUploadIntents)
        .where(
          and(
            eq(storageUploadIntents.agencyId, agencyId),
            inArray(storageUploadIntents.status, ["reserved", "uploaded"]),
          ),
        ),
    ]);
  const usedBytes = Number(counter?.currentValue ?? 0);
  const reservedBytes = Number(reserved?.value ?? 0);
  const quotaBytes = await getLimitForResource(database, agencyId, "storage_bytes");
  const projectedBytes = usedBytes + reservedBytes;
  const percentUsed = quotaBytes && quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0;
  const projectedPercentUsed =
    quotaBytes && quotaBytes > 0 ? (projectedBytes / quotaBytes) * 100 : 0;
  const warning =
    projectedPercentUsed >= 100
      ? "over_limit"
      : projectedPercentUsed >= 90
        ? "urgent"
        : projectedPercentUsed >= 80
          ? "warning"
          : "healthy";
  const mode = config?.mode === "agency_owned" ? "agency_owned" : "managed";
  const ownedConfigComplete =
    mode === "agency_owned" &&
    !!config?.accountId &&
    !!config.bucketOverride &&
    !!config.endpointOverride &&
    !!config.accessKeyLastFour &&
    !!config.secretAccessKeyLastFour;
  const providerConfigured = mode === "agency_owned" ? ownedConfigComplete : !!provider;
  const providerEnabled =
    mode === "agency_owned" ? (config?.enabled ?? false) : (provider?.enabled ?? false);
  const providerStatus =
    mode === "agency_owned" ? (config?.status ?? "pending") : (provider?.status ?? "not_tested");
  return {
    enabled: config?.enabled ?? false,
    status: config?.status ?? "pending",
    mode,
    keyPrefix: config?.keyPrefix ?? `agencies/${agencyId}`,
    accountId: mode === "agency_owned" ? (config?.accountId ?? null) : null,
    bucket: mode === "agency_owned" ? (config?.bucketOverride ?? null) : null,
    endpoint: mode === "agency_owned" ? (config?.endpointOverride ?? null) : null,
    accessKeyLastFour: mode === "agency_owned" ? (config?.accessKeyLastFour ?? null) : null,
    secretAccessKeyLastFour:
      mode === "agency_owned" ? (config?.secretAccessKeyLastFour ?? null) : null,
    ownedConfigComplete,
    lastHealthCheckAt: config?.lastHealthCheckAt ?? null,
    lastHealthCheckOk: config?.lastHealthCheckOk ?? null,
    providerConfigured,
    providerEnabled,
    providerStatus,
    usedBytes,
    reservedBytes,
    projectedBytes,
    availableBytes: quotaBytes == null ? null : Math.max(0, quotaBytes - projectedBytes),
    quotaBytes,
    percentUsed,
    projectedPercentUsed,
    objectCount: Number(objects?.value ?? 0),
    activeUploadCount: Number(activeIntents?.value ?? 0),
    warning,
  } as const;
}
