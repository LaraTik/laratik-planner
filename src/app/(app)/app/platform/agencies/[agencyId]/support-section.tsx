import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { listRequestsForAgency, type SupportAccessRequestRow } from "@/lib/support";

/**
 * M3.4 — Agency detail support-access section.
 *
 * Renders the most recent support access requests for the
 * agency. The platform admin uses this section to triage
 * pending requests before they escalate to the agency admin.
 * The agency admin's decision UI is rendered separately on
 * the agency admin's plan & usage page.
 *
 * The section is purely informational; no mutations are
 * exposed here (those go through the agency admin's
 * `/app/agency-settings/plan` page, which is the only place an
 * agency admin's decision is collected). The platform admin
 * who filed the request sees the live status in their own
 * `/app/platform/security` page.
 */
export async function SupportAccessSection({ agencyId }: { agencyId: string }) {
  const requests = await listRequestsForAgency(agencyId, { limit: 10 });

  const columns: DataTableColumnDef<SupportAccessRequestRow>[] = [
    { key: "ticketReference", header: "Ticket", cell: (row) => row.ticketReference },
    { key: "status", header: "Status", cell: (row) => row.status },
    {
      key: "duration",
      header: "Hours",
      cell: (row) => `${row.requestedDurationHours}h`,
    },
    {
      key: "scope",
      header: "Scope",
      cell: (row) =>
        row.scopeMetadataOnly
          ? "Metadata only"
          : row.scopeWorkspaceId
            ? `Workspace ${row.scopeWorkspaceId.slice(0, 8)}…`
            : "Agency-wide",
    },
    { key: "createdAt", header: "When", cell: (row) => formatRelativeDate(row.createdAt) },
  ];

  return (
    <Card padding="lg" className="space-y-4" data-testid="platform-agency-support-section">
      <div>
        <CardTitle>Support access requests</CardTitle>
        <CardDescription>
          The most recent ticketed support access requests for this agency. Agency admins decide
          each request from the agency-settings Plan & Usage page.
        </CardDescription>
      </div>
      {requests.length === 0 ? (
        <EmptyState
          title="No support access requests"
          description="No platform admin has filed a support access request for this agency yet."
          data-testid="platform-agency-support-empty"
        />
      ) : (
        <DataTable
          data-testid="platform-agency-support-table"
          getRowKey={(row) => row.id}
          rows={requests}
          columns={columns}
        />
      )}
    </Card>
  );
}
