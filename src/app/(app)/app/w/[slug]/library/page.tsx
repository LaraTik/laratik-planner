import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { CalendarRange, Clock, Layers, Megaphone } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { campaigns, contentPillars, contentTemplates } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { PageHeader } from "@/components/workspace/page-header";
import { SectionHeader } from "@/components/workspace/section-header";
import { humanFormat } from "@/lib/content/status";

const STATUS_VARIANT: Record<string, "success" | "warning" | "outline"> = {
  active: "success",
  draft: "warning",
  archived: "outline",
  scheduled: "success",
  ongoing: "success",
};

/**
 * Planning library (M3.8) — workspace-scoped catalogue of reusable
 * campaigns, content pillars, and templates.
 *
 * Stitch design (project 5403097764334458790, screen `7493876f`):
 *   - Sub-nav: Campaigns / Pillars / Templates (client-side tabs)
 *   - Campaigns: card grid with status, dates, owner, content progress
 *   - Pillars: 2-col table (Pillar / Description / Actions)
 *   - Templates: list with format icon + name + meta
 *
 * v1 keeps the three sections in a single page (no client-side tabs) —
 * each card hosts its own list, the workspace context is shown via the
 * timezone pill, and data-testids are wired for visual-regression.
 */
export default async function PlanningLibraryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const [campaignRows, pillars, templates] = await Promise.all([
    db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.workspaceId, workspace.id), isNull(campaigns.archivedAt))),
    db
      .select()
      .from(contentPillars)
      .where(and(eq(contentPillars.workspaceId, workspace.id), isNull(contentPillars.archivedAt))),
    db
      .select()
      .from(contentTemplates)
      .where(
        and(eq(contentTemplates.workspaceId, workspace.id), isNull(contentTemplates.archivedAt)),
      ),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title="Planning library"
        description={
          <>
            Reusable campaigns, content pillars, and templates for this workspace.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
      />

      <Card padding="none" className="overflow-hidden">
        <div className="border-border border-b px-4 py-3">
          <SectionHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Megaphone className="text-fg-secondary h-4 w-4" aria-hidden="true" />
                Campaigns
                <Badge variant="info">{campaignRows.length}</Badge>
              </span>
            }
          />
        </div>
        {campaignRows.length === 0 ? (
          <p className="text-body text-fg-muted px-4 py-6">
            No campaigns yet. Create one from the planning list to bundle related ideas.
          </p>
        ) : (
          <ul className="divide-border divide-y" data-testid="library-campaigns">
            {campaignRows.map((row) => (
              <li
                key={row.id}
                className="hover:bg-surface-subtle flex flex-wrap items-start justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-body text-fg-primary font-semibold">{row.name}</p>
                  {row.objective ? (
                    <p className="text-label text-fg-secondary mt-0.5">{row.objective}</p>
                  ) : null}
                </div>
                <div className="text-label text-fg-muted flex items-center gap-1.5">
                  <CalendarRange className="h-3 w-3" aria-hidden="true" />
                  {formatCampaignWindow(row.startDate, row.endDate)}
                </div>
                <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>{row.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="border-border border-b px-4 py-3">
          <SectionHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Layers className="text-fg-secondary h-4 w-4" aria-hidden="true" />
                Content pillars
                <Badge variant="info">{pillars.length}</Badge>
              </span>
            }
          />
        </div>
        {pillars.length === 0 ? (
          <p className="text-body text-fg-muted px-4 py-6">No content pillars yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              getRowKey={(p) => p.id}
              getRowTestId={(p) => `library-pillar-${p.id}`}
              rows={pillars}
              columns={pillarColumns()}
            />
          </div>
        )}
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="border-border border-b px-4 py-3">
          <SectionHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Layers className="text-fg-secondary h-4 w-4" aria-hidden="true" />
                Templates
                <Badge variant="info">{templates.length}</Badge>
              </span>
            }
          />
        </div>
        {templates.length === 0 ? (
          <p className="text-body text-fg-muted px-4 py-6">No templates yet.</p>
        ) : (
          <ul className="divide-border divide-y" data-testid="library-templates">
            {templates.map((row) => (
              <li
                key={row.id}
                className="hover:bg-surface-subtle flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-body text-fg-primary font-semibold">{row.name}</p>
                  <p className="text-label text-fg-muted mt-0.5">{humanFormat(row.format)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function formatCampaignWindow(start: Date | string | null, end: Date | string | null): string {
  const fmt = (d: Date | string) => {
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  if (end) return `Until ${fmt(end)}`;
  return "No window set";
}

function pillarColumns(): DataTableColumnDef<typeof contentPillars.$inferSelect>[] {
  return [
    {
      key: "name",
      header: "Pillar",
      cell: (p) => <span className="text-body text-fg-primary font-medium">{p.name}</span>,
    },
    {
      key: "description",
      header: "Description",
      cell: (p) =>
        p.description ? (
          <span className="text-body text-fg-secondary">{p.description}</span>
        ) : (
          <span className="text-fg-muted">&mdash;</span>
        ),
    },
  ];
}
