import Link from "next/link";
import { currentActor } from "@/lib/auth/current-actor";
import { PageHeader } from "@/components/workspace/page-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { tForActive } from "@/lib/i18n/t-for-active";
import { loadPlatformSecurityOverview } from "./actions";
import { PermissionNotice } from "@/components/platform/permission-notice";

/**
 * M3.4 — Platform · Security & support access.
 *
 * Stitch screen `2094dc437a1f4e57a7898246229c2808` (Security
 * and support access). The page is platform-admin gated by
 * the surrounding layout; the gate is re-checked here as a
 * defence-in-depth measure.
 *
 * Three blocks:
 *   1. **My active grants** — every grant the calling platform
 *      admin currently holds. The table shows target agency,
 *      scope, downloads allowed, time-remaining. The row's
 *      "Revoke" action is wired to the `revokeSupportAccessGrantAction`
 *      server action.
 *   2. **My recent views** — the last 50 audit-log rows where
 *      the actor is the viewer. No tenant content is rendered
 *      here; the table shows action + target type + outcome
 *      only.
 *   3. **Open requests by agency** — every agency with at
 *      least one support-access request, with the 10 most
 *      recent. The link routes to the agency detail page
 *      where the agency admin decides.
 */
export const metadata = { title: "Platform · Security" };
export const dynamic = "force-dynamic";

type GrantRow = {
  id: string;
  targetAgencyId: string;
  scopeWorkspaceId: string | null;
  scopeMetadataOnly: boolean;
  downloadsAllowed: boolean;
  activatedAt: Date;
  expiresAt: Date;
};
type AuditRow = {
  id: number;
  targetAgencyId: string;
  targetType: string;
  targetId: string | null;
  action: string;
  outcome: string;
  createdAt: Date;
};
type RequestRow = {
  id: string;
  ticketReference: string;
  reason: string;
  targetAgencyId: string;
  status: string;
  requestedDurationHours: number;
  createdAt: Date;
};

export default async function PlatformSecurityPage() {
  const { t } = await tForActive();
  const actor = await currentActor();
  if (!actor) {
    return (
      <div className="p-8">
        <p className="text-body text-fg-muted">{t("platform.securitySignInBody")}</p>
      </div>
    );
  }
  let overview;
  try {
    overview = await loadPlatformSecurityOverview(actor);
  } catch {
    return (
      <PermissionNotice
        title={t("platform.securityUnavailable")}
        description={t("platform.securityUnavailableBody")}
      />
    );
  }

  const grantColumns: DataTableColumnDef<GrantRow>[] = [
    {
      key: "agency",
      header: t("platform.securityColAgency"),
      cell: (row) => (
        <Link
          href={`/app/platform/agencies/${row.targetAgencyId}`}
          className="text-body text-primary hover:underline"
        >
          {row.targetAgencyId}
        </Link>
      ),
    },
    {
      key: "scope",
      header: t("platform.securityColScope"),
      cell: (row) =>
        row.scopeMetadataOnly
          ? t("platform.securityScopeMetadata")
          : row.scopeWorkspaceId
            ? t("platform.securityScopeWorkspace", { prefix: row.scopeWorkspaceId.slice(0, 8) })
            : t("platform.securityScopeAgency"),
    },
    {
      key: "downloads",
      header: t("platform.securityColDownloads"),
      cell: (row) => (row.downloadsAllowed ? t("platform.commonAllowed") : t("platform.commonOff")),
    },
    {
      key: "expires",
      header: t("platform.securityColExpires"),
      cell: (row) => formatRelativeDate(row.expiresAt),
    },
  ];

  const auditColumns: DataTableColumnDef<AuditRow>[] = [
    { key: "action", header: t("platform.securityColAction"), cell: (row) => row.action },
    {
      key: "targetType",
      header: t("platform.securityColTargetType"),
      cell: (row) => row.targetType,
    },
    {
      key: "outcome",
      header: t("platform.securityColOutcome"),
      cell: (row) => (
        <span
          className={
            row.outcome === "success"
              ? "text-success"
              : row.outcome === "denied"
                ? "text-warning"
                : "text-danger"
          }
        >
          {row.outcome}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: t("platform.securityColWhen"),
      cell: (row) => formatRelativeDate(row.createdAt),
    },
  ];

  return (
    <div className="space-y-6" data-testid="platform-security-root">
      <PageHeader
        title={t("platform.securityTitle")}
        description={t("platform.securityDescription")}
      />

      {overview.canRequestSupport ? (
        <Card>
          <CardTitle>{t("platform.securityActiveGrantsTitle")}</CardTitle>
          <CardDescription>{t("platform.securityActiveGrantsDescription")}</CardDescription>
          <div className="mt-4">
            {overview.activeGrants.length === 0 ? (
              <EmptyState
                title={t("platform.securityEmptyGrants")}
                description={t("platform.securityEmptyGrantsBody")}
                data-testid="platform-security-no-active-grants"
              />
            ) : (
              <DataTable
                columns={grantColumns}
                rows={overview.activeGrants as GrantRow[]}
                getRowKey={(row) => row.id}
              />
            )}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardTitle>
          {overview.canAudit
            ? t("platform.securityAuditTitle")
            : t("platform.securityRecentViewsTitle")}
        </CardTitle>
        <CardDescription>
          {overview.canAudit
            ? t("platform.securityAuditDescription")
            : t("platform.securityRecentViewsDescription")}
        </CardDescription>
        <div className="mt-4">
          {overview.recentAudit.length === 0 ? (
            <EmptyState
              title={t("platform.securityEmptyRecentViews")}
              description={t("platform.securityEmptyRecentViewsBody")}
              data-testid="platform-security-no-recent-views"
            />
          ) : (
            <DataTable
              columns={auditColumns}
              rows={overview.recentAudit as AuditRow[]}
              getRowKey={(row) => String(row.id)}
            />
          )}
        </div>
      </Card>

      {overview.canRequestSupport ? (
        <Card>
          <CardTitle>{t("platform.securityRequestsTitle")}</CardTitle>
          <CardDescription>{t("platform.securityRequestsDescription")}</CardDescription>
          <div className="mt-4 space-y-3">
            {overview.requestsByAgency.length === 0 ? (
              <EmptyState
                title={t("platform.securityEmptyRequests")}
                description={t("platform.securityEmptyRequestsBody")}
                data-testid="platform-security-no-requests"
              />
            ) : (
              overview.requestsByAgency.map((row) => (
                <div
                  key={row.agency.id}
                  className="border-border rounded-[var(--radius-control)] border p-3"
                  data-testid={`platform-security-agency-${row.agency.slug}`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Link
                      href={`/app/platform/agencies/${row.agency.id}`}
                      className="text-body text-fg-primary font-semibold"
                    >
                      {row.agency.name}
                    </Link>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/app/platform/agencies/${row.agency.id}`}>
                        {t("platform.securityOpenAgency")}
                      </Link>
                    </Button>
                  </div>
                  <ul className="space-y-2">
                    {(row.requests as RequestRow[]).map((req) => (
                      <li
                        key={req.id}
                        className="border-border flex flex-col gap-1 rounded-[var(--radius-control)] border p-2 text-sm"
                        data-testid={`platform-security-request-${req.id}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-body text-fg-primary font-mono">
                            {req.ticketReference}
                          </span>
                          <span className="text-label text-fg-muted">
                            {req.status} · {req.requestedDurationHours}h ·{" "}
                            {formatRelativeDate(req.createdAt)}
                          </span>
                        </div>
                        <p className="text-body text-fg-muted line-clamp-2">{req.reason}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
