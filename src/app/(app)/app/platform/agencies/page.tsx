import Link from "next/link";
import { count, desc, eq, sql } from "drizzle-orm";
import { Building2, Search } from "lucide-react";
import { db } from "@/lib/db";
import {
  agencyEntitlements,
  agencyMemberships,
  agencies,
  platformPlanTemplates,
  workspaces,
} from "@/lib/db/schema";
import { PageHeader } from "@/components/workspace/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { AgenciesTable, type PlatformAgencyRow } from "./agencies-table";
import { AddAgencyDrawer } from "./add-agency-drawer";
import { currentActor } from "@/lib/auth/current-actor";
import { requirePlatformPermission } from "@/lib/auth/platform-access";
import { PermissionNotice } from "@/components/platform/permission-notice";

/**
 * Platform agencies list (Milestone 1.8) — Stitch screen `973d8624f25441de8abecd6e16e5e403`.
 *
 * One row per agency with:
 *   - name + slug
 *   - active member count
 *   - workspace count (non-archived)
 *   - created date
 *   - drill-in link to `/app/platform/agencies/[id]`
 *
 * Search is a **client-side filter** over the already-loaded list
 * (M1 spec: "client-side filter, no backend"). This is intentional —
 * M1 has at most a handful of agencies; M2 will replace this with a
 * server-side search when the row count grows. The data payload is
 * small enough to ship in full on every request.
 *
 * M2 adds the transactional four-step agency provisioning drawer.
 */
export const metadata = { title: "Platform · Agencies" };

// See /app/platform/overview for the rationale. The page is gated
// by the platform layout's console-entry permission and this page's exact
// `platform.agency.read` check. It
// queries the agencies table — neither has a meaningful static
// representation, so we force-dynamic.
export const dynamic = "force-dynamic";

async function loadAgencies(): Promise<PlatformAgencyRow[]> {
  // One query that aggregates per-agency member + workspace counts.
  // We coalesce the LEFT JOINs so a row with zero members or zero
  // workspaces still surfaces with `0`, not `null`.
  const rows = await db
    .select({
      id: agencies.id,
      name: agencies.name,
      slug: agencies.slug,
      createdAt: agencies.createdAt,
      memberCount: sql<number>`count(distinct case when ${agencyMemberships.status} = 'active' then ${agencyMemberships.userId} end)`,
      workspaceCount: sql<number>`count(distinct case when ${workspaces.archivedAt} is null then ${workspaces.id} end)`,
      planName: platformPlanTemplates.name,
      suspendedAt: agencies.suspendedAt,
      archivedAt: agencies.archivedAt,
    })
    .from(agencies)
    .leftJoin(agencyMemberships, eq(agencyMemberships.agencyId, agencies.id))
    .leftJoin(workspaces, eq(workspaces.agencyId, agencies.id))
    .leftJoin(agencyEntitlements, eq(agencyEntitlements.agencyId, agencies.id))
    .leftJoin(
      platformPlanTemplates,
      eq(platformPlanTemplates.id, agencyEntitlements.planTemplateId),
    )
    .groupBy(
      agencies.id,
      agencies.name,
      agencies.slug,
      agencies.createdAt,
      agencies.suspendedAt,
      agencies.archivedAt,
      platformPlanTemplates.name,
    )
    .orderBy(desc(agencies.createdAt));

  // Coalesce the SQL bigint-ish counts to JS numbers. The casts are
  // safe because aggregate counts cannot exceed Number.MAX_SAFE_INTEGER
  // in any realistic deployment.
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    createdAt: r.createdAt,
    memberCount: Number(r.memberCount ?? 0),
    workspaceCount: Number(r.workspaceCount ?? 0),
    planName: r.planName ?? "Unassigned",
    lifecycle: r.archivedAt ? "archived" : r.suspendedAt ? "suspended" : "active",
  }));
}

async function loadTotalAgencyCount(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(agencies);
  return row?.value ?? 0;
}

export default async function PlatformAgenciesPage() {
  const actor = await currentActor();
  if (!actor) {
    return <PermissionNotice title="Sign in required" description="Sign in to view agencies." />;
  }
  let principal;
  try {
    principal = await requirePlatformPermission(actor, "platform.agency.read");
  } catch {
    return (
      <PermissionNotice
        title="Agency access unavailable"
        description="Your platform role does not include agency oversight."
      />
    );
  }
  const canCreateAgency = principal.permissions.has("platform.agency.create");
  const [rows, total, plans] = await Promise.all([
    loadAgencies(),
    loadTotalAgencyCount(),
    db
      .select({
        id: platformPlanTemplates.id,
        name: platformPlanTemplates.name,
        description: platformPlanTemplates.description,
      })
      .from(platformPlanTemplates)
      .where(sql`${platformPlanTemplates.archivedAt} is null`),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Agencies"
        description="Every agency on the platform. Use search to narrow by name or slug."
        action={canCreateAgency ? <AddAgencyDrawer plans={plans} /> : undefined}
      />

      {!canCreateAgency ? (
        <PermissionNotice
          title="Read-only agency access"
          description="You can inspect agencies, but your platform role cannot create them."
        />
      ) : null}

      {rows.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Building2 className="h-8 w-8" aria-hidden="true" />}
            title="No agencies on the platform"
            description="Platform bootstrap creates the singleton agency on first run. If this list is empty in production, check the bootstrap endpoint."
          />
        </Card>
      ) : (
        <Card padding="lg" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-body text-fg-muted">
              <span className="text-fg-primary font-semibold" data-testid="platform-agencies-total">
                {total}
              </span>{" "}
              {total === 1 ? "agency" : "agencies"} on the platform
            </div>
            <div className="relative w-full sm:w-72">
              <Search
                className="text-fg-muted absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder="Search by name or slug"
                aria-label="Search agencies"
                className="border-border bg-surface text-fg-primary placeholder:text-fg-muted focus-visible:ring-focus-ring w-full rounded-[var(--radius-control)] border py-2 ps-9 pe-3 focus:outline-none focus-visible:ring-2"
                data-testid="platform-agencies-search"
              />
            </div>
          </div>
          <AgenciesTable rows={rows} relativeNow={new Date().toISOString()} />
        </Card>
      )}

      <p className="text-label text-fg-muted">
        Need to investigate a specific agency? Open its{" "}
        <Link
          href="/app/platform/agencies"
          className="text-primary underline-offset-4 hover:underline"
        >
          detail page
        </Link>{" "}
        for plan, usage, AI, and lifecycle controls.
      </p>
    </>
  );
}
