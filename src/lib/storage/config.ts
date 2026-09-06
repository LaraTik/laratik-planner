import "server-only";
import { and, desc, eq, inArray, sum } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db } from "@/lib/db";
import {
  agencyStorageConfigs,
  agencyUsageCounters,
  platformAuditEvents,
  platformStorageProviderConfigs,
  storageUploadIntents,
} from "@/lib/db/schema";
import { requirePlatformPermission } from "@/lib/auth/platform-access";
import type { Actor } from "@/lib/auth/policy";
import { decryptSecret, encryptSecret } from "@/lib/security/secrets";
import { getLimitForResource } from "@/lib/usage/get-limit-for-resource";
import { R2ConfigSchema, type R2Config } from "./r2-config";
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

export async function testR2Connection(rawInput: unknown): Promise<void> {
  const config = R2ConfigSchema.parse(rawInput);
  const adapter = new R2ObjectStorageAdapter(config);
  await adapter.testConnection();
}

export async function saveManagedR2Config(actor: Actor, rawInput: unknown) {
  await requirePlatformPermission(actor, "platform.console.manage");
  const input = R2ConfigSchema.parse(rawInput);
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

export async function getAgencyStorageContext(agencyId: string, database: NodePgDatabase = db) {
  const [agencyConfig] = await database
    .select()
    .from(agencyStorageConfigs)
    .where(eq(agencyStorageConfigs.agencyId, agencyId))
    .limit(1);
  if (!agencyConfig || !agencyConfig.enabled || agencyConfig.status === "disabled") {
    throw new StorageConfigurationError("Agency storage is disabled");
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
  if (agencyConfig.mode !== "managed") {
    throw new StorageConfigurationError("Agency-owned storage is not enabled yet");
  }

  const base = toR2Config(platformConfig);
  const adapter = new R2ObjectStorageAdapter({
    ...base,
    ...(agencyConfig.endpointOverride ? { endpoint: agencyConfig.endpointOverride } : {}),
    ...(agencyConfig.bucketOverride ? { bucket: agencyConfig.bucketOverride } : {}),
  });
  return {
    adapter,
    bucket: agencyConfig.bucketOverride ?? base.bucket,
    keyPrefix: agencyConfig.keyPrefix,
  };
}

export async function getAgencyStorageAdapter(agencyId: string, database: NodePgDatabase = db) {
  return (await getAgencyStorageContext(agencyId, database)).adapter;
}

export async function getAgencyStorageSummary(agencyId: string, database: NodePgDatabase = db) {
  const [[config], [counter], [reserved]] = await Promise.all([
    database
      .select({
        enabled: agencyStorageConfigs.enabled,
        status: agencyStorageConfigs.status,
        lastHealthCheckAt: agencyStorageConfigs.lastHealthCheckAt,
        lastHealthCheckOk: agencyStorageConfigs.lastHealthCheckOk,
      })
      .from(agencyStorageConfigs)
      .where(eq(agencyStorageConfigs.agencyId, agencyId))
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
  ]);
  const usedBytes = Number(counter?.currentValue ?? 0);
  const quotaBytes = await getLimitForResource(database, agencyId, "storage_bytes");
  const percentUsed = quotaBytes && quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0;
  const warning =
    percentUsed >= 100
      ? "over_limit"
      : percentUsed >= 90
        ? "urgent"
        : percentUsed >= 80
          ? "warning"
          : "healthy";
  return {
    enabled: config?.enabled ?? false,
    status: config?.status ?? "pending",
    lastHealthCheckAt: config?.lastHealthCheckAt ?? null,
    lastHealthCheckOk: config?.lastHealthCheckOk ?? null,
    usedBytes,
    reservedBytes: Number(reserved?.value ?? 0),
    quotaBytes,
    percentUsed,
    warning,
  } as const;
}
