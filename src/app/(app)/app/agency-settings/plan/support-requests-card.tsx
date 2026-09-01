import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { listRequestsForAgency, type SupportAccessRequestRow } from "@/lib/support";
import { tForActive } from "@/lib/i18n/t-for-active";

/**
 * M3.4 — Agency admin's view of pending support access
 * requests.
 *
 * Stitch screen `b739d9f79ffd48d3a179abe1ef2d95b8` (Agency
 * plan and usage) extends naturally with this block. The
 * agency admin sees every pending platform-admin request for
 * their agency and can navigate to the decision UI
 * (implemented as a separate flow under `/app/agency-settings/plan`).
 *
 * The list is read-only here — the decisions are intentionally
 * a separate page to keep the agency's main plan screen
 * uncluttered. The "Open" link takes the agency admin to the
 * dedicated decision page where the approve / reject UI lives.
 */
export async function SupportAccessRequestsCard({ agencyId }: { agencyId: string }) {
  const { t } = await tForActive();
  const requests = await listRequestsForAgency(agencyId, { limit: 25 });
  const pending = requests.filter((r) => r.status === "pending");
  const recent = requests.filter((r) => r.status !== "pending").slice(0, 5);

  const columns: DataTableColumnDef<SupportAccessRequestRow>[] = [
    {
      key: "ticketReference",
      header: t("agencyPlan.supportColTicket"),
      cell: (row) => row.ticketReference,
    },
    {
      key: "status",
      header: t("agencyPlan.supportColStatus"),
      cell: (row) => (
        <Badge
          variant={
            row.status === "pending"
              ? "warning"
              : row.status === "approved"
                ? "success"
                : row.status === "rejected"
                  ? "danger"
                  : "default"
          }
        >
          {t(`agencyPlan.supportStatus.${row.status}`, { defaultValue: row.status })}
        </Badge>
      ),
    },
    {
      key: "duration",
      header: t("agencyPlan.supportColHours"),
      cell: (row) => `${row.requestedDurationHours}h`,
    },
    {
      key: "scope",
      header: t("agencyPlan.supportColScope"),
      cell: (row) =>
        row.scopeMetadataOnly
          ? t("agencyPlan.supportScopeMetadata")
          : row.scopeWorkspaceId
            ? t("agencyPlan.supportScopeWorkspace", { prefix: row.scopeWorkspaceId.slice(0, 8) })
            : t("agencyPlan.supportScopeAgency"),
    },
    {
      key: "createdAt",
      header: t("agencyPlan.supportColWhen"),
      cell: (row) => formatRelativeDate(row.createdAt),
    },
  ];

  return (
    <Card padding="lg" className="space-y-4" data-testid="agency-plan-support-requests">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle>{t("agencyPlan.supportRequestsTitle")}</CardTitle>
          <CardDescription>{t("agencyPlan.supportRequestsBody")}</CardDescription>
        </div>
        <Link
          href="/app/agency-settings/plan/support"
          className="text-primary focus-visible:ring-focus-ring text-body inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
          data-testid="agency-plan-support-requests-link"
        >
          {pending.length > 0
            ? t("agencyPlan.supportReviewPending", { count: pending.length })
            : t("agencyPlan.supportViewHistory")}
        </Link>
      </div>

      {pending.length === 0 && recent.length === 0 ? (
        <EmptyState
          title={t("agencyPlan.supportEmptyTitle")}
          description={t("agencyPlan.supportEmptyBody")}
          data-testid="agency-plan-support-empty"
        />
      ) : (
        <div className="space-y-3">
          {pending.length > 0 ? (
            <DataTable
              data-testid="agency-plan-support-pending"
              getRowKey={(row) => row.id}
              rows={pending}
              columns={columns}
            />
          ) : null}
          {recent.length > 0 ? (
            <div data-testid="agency-plan-support-recent">
              <h4 className="text-title-card text-fg-primary mb-2 font-semibold">
                {t("agencyPlan.supportRecentHeading")}
              </h4>
              <DataTable getRowKey={(row) => row.id} rows={recent} columns={columns} />
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
