import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { listRequestsForAgency, type SupportAccessRequestRow } from "@/lib/support";
import { SupportAccessRequestForm } from "../../security/request-access-form";

type Translator = (key: string, params?: Record<string, string | number>) => string;

const EN_FALLBACK: Translator = (key, params) => {
  const lookup: Record<string, string> = {
    "platform.supportRequestTitle": "Request temporary support access",
    "platform.supportRequestBody":
      "Request only the scope needed for a ticket. Platform access alone never opens tenant content.",
    "platform.supportRequestsTitle": "Support access requests",
    "platform.supportRequestsBody":
      "The most recent ticketed support access requests for this agency. Agency admins decide each request from the agency-settings Plan & Usage page.",
    "platform.supportEmptyTitle": "No support access requests",
    "platform.supportEmptyBody": "No support operator has filed a request for this agency yet.",
    "platform.supportColTicket": "Ticket",
    "platform.supportColStatus": "Status",
    "platform.supportColHours": "Hours",
    "platform.supportColScope": "Scope",
    "platform.supportColWhen": "When",
    "platform.supportScopeMetadata": "Metadata only",
    "platform.supportScopeWorkspace": "Workspace {prefix}…",
    "platform.supportScopeAgency": "Agency-wide",
  };
  return lookup[key]?.replace("{prefix}", String(params?.prefix ?? "")) ?? key;
};

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
export async function SupportAccessSection({
  agencyId,
  agencyName,
  workspaces,
  canRequestSupport,
  t,
}: {
  agencyId: string;
  agencyName: string;
  workspaces: ReadonlyArray<{ id: string; name: string }>;
  canRequestSupport: boolean;
  t?: Translator;
}) {
  const tr: Translator = t ?? EN_FALLBACK;
  const requests = await listRequestsForAgency(agencyId, { limit: 10 });

  const columns: DataTableColumnDef<SupportAccessRequestRow>[] = [
    {
      key: "ticketReference",
      header: tr("platform.supportColTicket"),
      cell: (row) => row.ticketReference,
    },
    { key: "status", header: tr("platform.supportColStatus"), cell: (row) => row.status },
    {
      key: "duration",
      header: tr("platform.supportColHours"),
      cell: (row) => `${row.requestedDurationHours}h`,
    },
    {
      key: "scope",
      header: tr("platform.supportColScope"),
      cell: (row) =>
        row.scopeMetadataOnly
          ? tr("platform.supportScopeMetadata")
          : row.scopeWorkspaceId
            ? tr("platform.supportScopeWorkspace", { prefix: row.scopeWorkspaceId.slice(0, 8) })
            : tr("platform.supportScopeAgency"),
    },
    {
      key: "createdAt",
      header: tr("platform.supportColWhen"),
      cell: (row) => formatRelativeDate(row.createdAt),
    },
  ];

  return (
    <div className="space-y-4" data-testid="platform-agency-support-section">
      {canRequestSupport ? (
        <Card padding="lg" className="space-y-4">
          <div>
            <CardTitle>{tr("platform.supportRequestTitle")}</CardTitle>
            <CardDescription>{tr("platform.supportRequestBody")}</CardDescription>
          </div>
          <SupportAccessRequestForm
            agencyId={agencyId}
            agencyName={agencyName}
            workspaces={workspaces}
          />
        </Card>
      ) : null}

      <Card padding="lg" className="space-y-4">
        <div>
          <CardTitle>{tr("platform.supportRequestsTitle")}</CardTitle>
          <CardDescription>{tr("platform.supportRequestsBody")}</CardDescription>
        </div>
        {requests.length === 0 ? (
          <EmptyState
            title={tr("platform.supportEmptyTitle")}
            description={tr("platform.supportEmptyBody")}
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
    </div>
  );
}
