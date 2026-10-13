import { and, eq, gt } from "drizzle-orm";
import type { db as appDb } from "@/lib/db";
import {
  advertisingAccounts,
  advertisingConnectionAccounts,
  advertisingConnections,
  advertisingSyncStates,
  advertisingSpendObservations,
  advertisingSpendReconciliations,
} from "@/lib/db/schema";

type Db = typeof appDb;

export type AdvertisingSpendObservationInput = {
  readonly externalAdId: string;
  readonly externalCampaignId?: string | null | undefined;
  readonly externalAdSetId?: string | null | undefined;
  readonly reportDate: string;
  readonly currency: string;
  readonly spend: string;
  readonly impressions: number;
  readonly clicks: number;
  readonly attributionWindow: string;
  readonly actionReportTime: string;
};

export type SpendReconciliation = {
  readonly providerAccountSpend: string;
  readonly canonicalAdSpend: string;
  readonly workspaceAttributedSpend: string;
  readonly unallocatedSpend: string;
  readonly discrepancy: string;
  readonly completeness: "complete" | "partial" | "unavailable";
};

export class AdvertisingIngestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdvertisingIngestionError";
  }
}

export class AdvertisingLeaseLostError extends Error {
  constructor() {
    super("advertising_lease_lost");
    this.name = "AdvertisingLeaseLostError";
  }
}

export type AdvertisingLease = {
  readonly stateId: string;
  readonly leaseToken: string;
};

function parseMicros(value: string): bigint {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value))
    throw new AdvertisingIngestionError("advertising_spend_invalid");
  const [whole, fraction = ""] = value.split(".");
  if (!whole) throw new AdvertisingIngestionError("advertising_spend_invalid");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

function formatMicros(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 1_000_000n;
  const fraction = (absolute % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${sign}${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

export function buildSpendReconciliation(args: {
  providerAccountSpend: string;
  canonicalAdSpend: string;
  workspaceAttributedSpend: string;
  completeness: SpendReconciliation["completeness"];
}): SpendReconciliation {
  const provider = parseMicros(args.providerAccountSpend);
  const canonical = parseMicros(args.canonicalAdSpend);
  const attributed = parseMicros(args.workspaceAttributedSpend);
  return {
    providerAccountSpend: formatMicros(provider),
    canonicalAdSpend: formatMicros(canonical),
    workspaceAttributedSpend: formatMicros(attributed),
    unallocatedSpend: formatMicros(provider - attributed),
    discrepancy: formatMicros(provider - canonical),
    completeness: args.completeness,
  };
}

/**
 * Idempotently ingest bounded provider ad-day facts. The uniqueness key is
 * account/ad/day/report context, not connection, so shared accounts cannot
 * duplicate spending when two credentials observe the same provider facts.
 */
export async function ingestAdvertisingSpend(
  db: Db,
  args: {
    agencyId: string;
    accountId: string;
    connectionId: string;
    syncRunId?: string | null | undefined;
    providerDataVersion?: string | null | undefined;
    lease?: AdvertisingLease | undefined;
    observations: readonly AdvertisingSpendObservationInput[];
  },
) {
  if (args.observations.length > 500)
    throw new AdvertisingIngestionError("advertising_observation_batch_too_large");
  const [account] = await db
    .select({ id: advertisingAccounts.id, agencyId: advertisingAccounts.agencyId })
    .from(advertisingAccounts)
    .where(
      and(
        eq(advertisingAccounts.id, args.accountId),
        eq(advertisingAccounts.agencyId, args.agencyId),
      ),
    )
    .limit(1);
  if (!account) throw new AdvertisingIngestionError("advertising_account_not_in_agency");
  const [connection] = await db
    .select({ id: advertisingConnections.id })
    .from(advertisingConnections)
    .innerJoin(
      advertisingConnectionAccounts,
      eq(advertisingConnectionAccounts.connectionId, advertisingConnections.id),
    )
    .where(
      and(
        eq(advertisingConnections.id, args.connectionId),
        eq(advertisingConnections.agencyId, args.agencyId),
        eq(advertisingConnections.status, "active"),
        eq(advertisingConnectionAccounts.accountId, args.accountId),
        eq(advertisingConnectionAccounts.status, "active"),
      ),
    )
    .limit(1);
  if (!connection) throw new AdvertisingIngestionError("advertising_connection_account_not_active");

  if (args.observations.length === 0) {
    if (args.lease) {
      await db
        .select({ id: advertisingSyncStates.id })
        .from(advertisingSyncStates)
        .where(
          and(
            eq(advertisingSyncStates.id, args.lease.stateId),
            eq(advertisingSyncStates.leaseToken, args.lease.leaseToken),
            gt(advertisingSyncStates.leaseExpiresAt, new Date()),
          ),
        )
        .limit(1)
        .then((rows) => {
          if (!rows[0]) throw new AdvertisingLeaseLostError();
        });
    }
    return { written: 0 };
  }
  const written = await db.transaction(async (tx) => {
    if (args.lease) {
      const [lease] = await tx
        .select({ id: advertisingSyncStates.id })
        .from(advertisingSyncStates)
        .where(
          and(
            eq(advertisingSyncStates.id, args.lease.stateId),
            eq(advertisingSyncStates.leaseToken, args.lease.leaseToken),
            gt(advertisingSyncStates.leaseExpiresAt, new Date()),
          ),
        )
        .for("update")
        .limit(1);
      if (!lease) throw new AdvertisingLeaseLostError();
    }
    const rows = await tx
      .insert(advertisingSpendObservations)
      .values(
        args.observations.map((observation) => ({
          agencyId: args.agencyId,
          accountId: args.accountId,
          connectionId: args.connectionId,
          syncRunId: args.syncRunId ?? null,
          externalAdId: observation.externalAdId,
          externalCampaignId: observation.externalCampaignId ?? null,
          externalAdSetId: observation.externalAdSetId ?? null,
          reportDate: observation.reportDate,
          currency: observation.currency,
          spend: observation.spend,
          impressions: observation.impressions,
          clicks: observation.clicks,
          attributionWindow: observation.attributionWindow,
          actionReportTime: observation.actionReportTime,
          providerDataVersion: args.providerDataVersion ?? null,
          observedAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: [
          advertisingSpendObservations.agencyId,
          advertisingSpendObservations.accountId,
          advertisingSpendObservations.externalAdId,
          advertisingSpendObservations.reportDate,
          advertisingSpendObservations.attributionWindow,
          advertisingSpendObservations.actionReportTime,
        ],
        set: {
          connectionId: args.connectionId,
          syncRunId: args.syncRunId ?? null,
          spend: advertisingSpendObservations.spend,
          impressions: advertisingSpendObservations.impressions,
          clicks: advertisingSpendObservations.clicks,
          providerDataVersion: args.providerDataVersion ?? null,
          observedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning({ id: advertisingSpendObservations.id });
    return rows.length;
  });
  return { written };
}

export async function upsertAdvertisingReconciliation(
  db: Db,
  args: {
    agencyId: string;
    accountId: string;
    reportDate: string;
    currency: string;
    attributionWindow: string;
    reconciliation: SpendReconciliation;
    lease?: AdvertisingLease | undefined;
  },
) {
  return db.transaction(async (tx) => {
    if (args.lease) {
      const [lease] = await tx
        .select({ id: advertisingSyncStates.id })
        .from(advertisingSyncStates)
        .where(
          and(
            eq(advertisingSyncStates.id, args.lease.stateId),
            eq(advertisingSyncStates.leaseToken, args.lease.leaseToken),
            gt(advertisingSyncStates.leaseExpiresAt, new Date()),
          ),
        )
        .for("update")
        .limit(1);
      if (!lease) throw new AdvertisingLeaseLostError();
    }

    const [row] = await tx
      .insert(advertisingSpendReconciliations)
      .values({
        agencyId: args.agencyId,
        accountId: args.accountId,
        reportDate: args.reportDate,
        currency: args.currency,
        attributionWindow: args.attributionWindow,
        ...args.reconciliation,
        checkedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          advertisingSpendReconciliations.agencyId,
          advertisingSpendReconciliations.accountId,
          advertisingSpendReconciliations.reportDate,
          advertisingSpendReconciliations.attributionWindow,
        ],
        set: { ...args.reconciliation, checkedAt: new Date(), updatedAt: new Date() },
      })
      .returning({ id: advertisingSpendReconciliations.id });
    if (!row) throw new AdvertisingIngestionError("advertising_reconciliation_not_persisted");
    return row;
  });
}
