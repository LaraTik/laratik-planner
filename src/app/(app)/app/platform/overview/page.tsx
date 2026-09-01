import Link from "next/link";
import { count, desc, eq, isNull, sql } from "drizzle-orm";
import { Building, Building2, Sparkles, Users2, Workflow } from "lucide-react";
import { db } from "@/lib/db";
import { agencyMemberships, agencies, aiUsageEvents, workspaces } from "@/lib/db/schema";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { KpiTile } from "@/components/workspace/kpi-tile";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { currentActor } from "@/lib/auth/current-actor";
import { requirePlatformPermission } from "@/lib/auth/platform-access";
import { PermissionNotice } from "@/components/platform/permission-notice";

/**
 * Platform overview (Milestone 1.8) — Stitch screen `46cf5746bbd14e67aac6565fc53530f8`.
 *
 * Four aggregate KPIs across the entire platform:
 *   1. Total agencies        — count of all agency rows (no filter on
 *                              singletonKey: M2 may allow multiple
 *                              agencies; M1 ships with the seeded one).
 *   2. Total active users    — distinct users with an active
 *                              `agency_membership` row.
 *   3. Total workspaces      — non-archived workspaces across all
 *                              agencies.
 *   4. Aggregate AI usage    — successful `ai_usage_event` rows
 *                              (M1 only counts the call count, not
 *                              tokens; M2 will surface token totals
 *                              and the per-capability breakdown).
 *
 * Each value falls back to 0 when the table is empty so the page is
 * never blank in a fresh environment. The layout above this page
 * enforces console entry; this page re-checks exact agency-read authority
 * before loading data.
 */
export const metadata = { title: "Platform overview" };

// The page is gated by the platform layout's console-entry check and then by
// its own exact `platform.agency.read` check. Both are
// runtime-only — there is no meaningful static prerender — so we
// mark the route force-dynamic to prevent Next.js from invoking the
// data loaders during `next build` against a possibly-unreachable
// database. This matches the `account` page pattern.
export const dynamic = "force-dynamic";

type OverviewKpis = {
  totalAgencies: number;
  totalActiveUsers: number;
  totalWorkspaces: number;
  totalAiCalls: number;
};

async function loadOverviewKpis(): Promise<OverviewKpis> {
  const [agencyRow, userRow, workspaceRow, aiRow] = await Promise.all([
    db.select({ value: count() }).from(agencies),
    db
      // Distinct active members across the platform.
      .select({ value: sql<number>`count(distinct ${agencyMemberships.userId})` })
      .from(agencyMemberships)
      .where(eq(agencyMemberships.status, "active")),
    db.select({ value: count() }).from(workspaces).where(isNull(workspaces.archivedAt)),
    db
      // Count of successful AI invocations. Per-capability token
      // breakdowns land in M2 (StudioFlow §15 "30-day usage" panel).
      .select({ value: count() })
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.succeeded, true)),
  ]);

  return {
    totalAgencies: agencyRow[0]?.value ?? 0,
    totalActiveUsers: userRow[0]?.value ?? 0,
    totalWorkspaces: workspaceRow[0]?.value ?? 0,
    totalAiCalls: aiRow[0]?.value ?? 0,
  };
}

async function loadRecentAgencies(limit = 5) {
  return db
    .select({
      id: agencies.id,
      name: agencies.name,
      slug: agencies.slug,
      createdAt: agencies.createdAt,
    })
    .from(agencies)
    .orderBy(desc(agencies.createdAt))
    .limit(limit);
}

export default async function PlatformOverviewPage() {
  const actor = await currentActor();
  const { t } = await tForActive();
  if (!actor) {
    return (
      <PermissionNotice
        title={t("platform.signInRequired")}
        description={t("platform.signInRequiredBody")}
      />
    );
  }
  try {
    await requirePlatformPermission(actor, "platform.agency.read");
  } catch {
    return (
      <PermissionNotice
        title={t("platform.overviewUnavailable")}
        description={t("platform.overviewUnavailableBody")}
      />
    );
  }
  const [kpis, recent] = await Promise.all([loadOverviewKpis(), loadRecentAgencies(5)]);

  return (
    <>
      <PageHeader
        eyebrow={t("platform.eyebrow")}
        title={t("platform.overviewTitle")}
        description={t("platform.overviewDescription")}
        action={
          <Link
            href="/app/platform/agencies"
            className="border-border bg-surface text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring text-button inline-flex items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 font-semibold focus:outline-none focus-visible:ring-2"
            data-testid="platform-overview-view-agencies"
          >
            <Building2 className="h-4 w-4" aria-hidden="true" />
            {t("platform.viewAgencies")}
          </Link>
        }
      />

      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="platform-overview-kpi-row"
      >
        <KpiTile
          icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
          label={t("platform.kpiTotalAgencies")}
          value={kpis.totalAgencies}
          data-testid="platform-overview-kpi-agencies"
        />
        <KpiTile
          icon={<Users2 className="h-4 w-4" aria-hidden="true" />}
          label={t("platform.kpiActiveUsers")}
          value={kpis.totalActiveUsers}
          data-testid="platform-overview-kpi-users"
        />
        <KpiTile
          icon={<Workflow className="h-4 w-4" aria-hidden="true" />}
          label={t("platform.kpiTotalWorkspaces")}
          value={kpis.totalWorkspaces}
          data-testid="platform-overview-kpi-workspaces"
        />
        <KpiTile
          icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
          label={t("platform.kpiAiUsage")}
          value={kpis.totalAiCalls}
          tone="success"
          data-testid="platform-overview-kpi-ai"
        />
      </div>

      <Card padding="lg" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>{t("platform.recentTitle")}</CardTitle>
            <CardDescription>{t("platform.recentDescription")}</CardDescription>
          </div>
          <Link
            href="/app/platform/agencies"
            className="text-primary focus-visible:ring-focus-ring text-body rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
          >
            {t("platform.seeAll")}
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-body text-fg-muted" data-testid="platform-overview-recent-empty">
            {t("platform.recentEmpty")}
          </p>
        ) : (
          <ul
            className="border-border divide-border divide-y rounded-[var(--radius-control)] border"
            data-testid="platform-overview-recent-list"
          >
            {recent.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="bg-primary-subtle text-primary inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)]"
                    aria-hidden="true"
                  >
                    <Building className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={`/app/platform/agencies/${a.id}`}
                      className="text-body text-fg-primary hover:text-primary block truncate font-semibold"
                    >
                      {a.name}
                    </Link>
                    <p className="text-label text-fg-muted truncate">{a.slug}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
