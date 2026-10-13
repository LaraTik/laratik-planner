import { and, desc, eq, isNull } from "drizzle-orm";
import type { db as appDb } from "@/lib/db";
import {
  advertisingConnectionAccounts,
  advertisingConnections,
  advertisingCredentialVersions,
  advertisingSyncStates,
} from "@/lib/db/schema";
import { createDekCache, getDekForAgency } from "@/lib/social/key-management";
import {
  openAdvertisingCredentials,
  sealAdvertisingCredentials,
  type AdvertisingCredentialPayload,
} from "./crypto";

type Db = typeof appDb;

export class AdvertisingConnectionNotFoundError extends Error {
  constructor() {
    super("Advertising connection not found");
    this.name = "AdvertisingConnectionNotFoundError";
  }
}

export class AdvertisingConnectionRevokedError extends Error {
  constructor() {
    super("Advertising connection is revoked");
    this.name = "AdvertisingConnectionRevokedError";
  }
}

export type StoredAdvertisingCredential = {
  readonly connectionId: string;
  readonly credentialVersionId: string;
  readonly version: number;
  readonly credentialRef: string;
};

/**
 * Store a new encrypted credential version. The plaintext is accepted only in
 * this server-side function, is sealed with the agency DEK, and is never
 * returned or logged. A new version is inserted before the connection pointer
 * advances, so a failed rotation leaves the previous version usable.
 */
export async function storeAdvertisingCredential(
  db: Db,
  args: {
    agencyId: string;
    connectionId: string;
    credentials: AdvertisingCredentialPayload;
    actorId?: string | undefined;
    accessTokenExpiresAt?: Date | null | undefined;
    refreshTokenExpiresAt?: Date | null | undefined;
  },
): Promise<StoredAdvertisingCredential> {
  const connection = (
    await db
      .select({
        id: advertisingConnections.id,
        agencyId: advertisingConnections.agencyId,
        currentCredentialVersion: advertisingConnections.currentCredentialVersion,
        credentialRef: advertisingConnections.credentialRef,
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
  if (!connection) throw new AdvertisingConnectionNotFoundError();
  if (connection.status === "revoked") throw new AdvertisingConnectionRevokedError();

  const cache = createDekCache(db);
  const dek = await getDekForAgency(db, cache, args.agencyId);
  const sealed = sealAdvertisingCredentials(args.credentials, dek);
  const version = connection.currentCredentialVersion + 1;

  return db.transaction(async (tx) => {
    // Retain historical envelopes for audit, but revoke every older version
    // before advancing the pointer so only one credential can be used.
    await tx
      .update(advertisingCredentialVersions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(advertisingCredentialVersions.connectionId, connection.id),
          isNull(advertisingCredentialVersions.revokedAt),
        ),
      );
    const inserted = await tx
      .insert(advertisingCredentialVersions)
      .values({
        connectionId: connection.id,
        version,
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        tag: sealed.tag,
        keyVersion: sealed.keyVersion,
        accessTokenExpiresAt: args.accessTokenExpiresAt,
        refreshTokenExpiresAt: args.refreshTokenExpiresAt,
        createdBy: args.actorId,
      })
      .returning({ id: advertisingCredentialVersions.id });
    const row = inserted[0];
    if (!row) throw new Error("Advertising credential version was not created");
    await tx
      .update(advertisingConnections)
      .set({
        currentCredentialVersion: version,
        status: "invalid",
        lastValidationStatus: null,
        lastValidationCode: null,
        updatedAt: new Date(),
      })
      .where(eq(advertisingConnections.id, connection.id));
    return {
      connectionId: connection.id,
      credentialVersionId: row.id,
      version,
      credentialRef: connection.credentialRef,
    };
  });
}

/** Immediately disables provider reads and all active credential versions. */
export async function revokeAdvertisingConnection(
  db: Db,
  args: { agencyId: string; connectionId: string },
): Promise<{ connectionId: string; revoked: true }> {
  const updated = await db.transaction(async (tx) => {
    const result = await tx
      .update(advertisingConnections)
      .set({
        status: "revoked",
        revokedAt: new Date(),
        currentCredentialVersion: 0,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(advertisingConnections.id, args.connectionId),
          eq(advertisingConnections.agencyId, args.agencyId),
        ),
      )
      .returning({ id: advertisingConnections.id });
    if (result.length === 0) throw new AdvertisingConnectionNotFoundError();
    await tx
      .update(advertisingCredentialVersions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(advertisingCredentialVersions.connectionId, args.connectionId),
          isNull(advertisingCredentialVersions.revokedAt),
        ),
      );
    await tx
      .update(advertisingConnectionAccounts)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(eq(advertisingConnectionAccounts.connectionId, args.connectionId));
    await tx
      .update(advertisingSyncStates)
      .set({ status: "paused", nextRunAt: null, updatedAt: new Date() })
      .where(eq(advertisingSyncStates.connectionId, args.connectionId));
    return result[0];
  });
  if (!updated) throw new AdvertisingConnectionNotFoundError();
  return { connectionId: updated.id, revoked: true };
}

/** Resolve the current credential for a provider adapter; never use in a route response. */
export async function resolveAdvertisingCredential(
  db: Db,
  args: { agencyId: string; connectionId: string },
): Promise<AdvertisingCredentialPayload> {
  const connection = (
    await db
      .select({
        id: advertisingConnections.id,
        agencyId: advertisingConnections.agencyId,
        currentCredentialVersion: advertisingConnections.currentCredentialVersion,
      })
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
  if (!connection || connection.currentCredentialVersion < 1) {
    throw new AdvertisingConnectionNotFoundError();
  }
  const row = (
    await db
      .select()
      .from(advertisingCredentialVersions)
      .where(
        and(
          eq(advertisingCredentialVersions.connectionId, connection.id),
          eq(advertisingCredentialVersions.version, connection.currentCredentialVersion),
          isNull(advertisingCredentialVersions.revokedAt),
        ),
      )
      .orderBy(desc(advertisingCredentialVersions.createdAt))
      .limit(1)
  )[0];
  if (!row) throw new AdvertisingConnectionNotFoundError();
  const dek = await getDekForAgency(db, createDekCache(db), args.agencyId);
  return openAdvertisingCredentials(
    {
      ciphertext: row.ciphertext,
      iv: row.iv,
      tag: row.tag,
      keyVersion: row.keyVersion as 1,
    },
    dek,
  );
}
