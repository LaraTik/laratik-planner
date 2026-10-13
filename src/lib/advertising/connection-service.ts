import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { db as appDb } from "@/lib/db";
import {
  advertisingAccounts,
  advertisingCapabilities,
  advertisingConnectionAccounts,
  advertisingConnections,
  advertisingValidationResults,
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
  return row;
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
      .select({ id: advertisingConnections.id, provider: advertisingConnections.provider })
      .from(advertisingConnections)
      .where(
        and(
          eq(advertisingConnections.id, args.connectionId),
          eq(advertisingConnections.agencyId, args.agencyId),
          eq(advertisingConnections.status, "active"),
        ),
      )
      .limit(1)
  )[0];
  if (!connection) throw new AdvertisingConnectionInputError("advertising_connection_not_active");

  return db.transaction(async (tx) => {
    const [account] = await tx
      .insert(advertisingAccounts)
      .values({
        agencyId: args.agencyId,
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
