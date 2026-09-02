import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { CalendarRange, Clock, Layers, Megaphone } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { campaigns, contentPillars, contentTemplates } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { tForActive } from "@/lib/i18n/t-for-active";
import { formatDate } from "@/lib/i18n/format-locale";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/workspace/page-header";
import { SectionHeader } from "@/components/workspace/section-header";
import { humanFormat } from "@/lib/content/status";
import {
  ArchiveCampaignButton,
  ArchivePillarButton,
  ArchiveTemplateButton,
  NewCampaignForm,
  NewPillarForm,
  NewTemplateForm,
} from "./library-forms";

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
  const { t, code } = await tForActive();
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
  // FEAT-06 — show the "New ..." forms only to roles that may
  // mutate the library (workspace_manager / content_planner). The
  // service layer is the authoritative gate; this is purely a UX
  // hide so reviewers don't see a form they can't submit.
  const canEditLibrary = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
    "content_planner",
  ]);
  return (
    <div className="space-y-6" data-testid="library-campaigns">
      <PageHeader
        eyebrow={workspace.name}
        title={t("users.library.title")}
        description={
          <>
            {t("users.library.description")}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
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
                {t("users.library.campaigns")}
                <Badge variant="info">{campaignRows.length}</Badge>
              </span>
            }
          />
        </div>
        {campaignRows.length === 0 ? (
          <div className="px-4 py-6" data-testid="library-campaign-empty">
            <EmptyState
              icon={<Megaphone className="h-8 w-8" aria-hidden="true" />}
              title={t("users.library.campaignsEmpty")}
              description={t("users.library.campaignsEmptyDescription")}
            />
          </div>
        ) : (
          <ul className="divide-border divide-y" data-testid="library-campaign-list">
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
                  {formatCampaignWindow(row.startDate, row.endDate, t, code)}
                </div>
                <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>{row.status}</Badge>
                {canEditLibrary ? <ArchiveCampaignButton slug={slug} id={row.id} /> : null}
              </li>
            ))}
          </ul>
        )}
        {canEditLibrary ? (
          <div className="border-border border-t px-4 py-3">
            <NewCampaignForm slug={slug} />
          </div>
        ) : null}
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="border-border border-b px-4 py-3">
          <SectionHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Layers className="text-fg-secondary h-4 w-4" aria-hidden="true" />
                {t("users.library.pillars")}
                <Badge variant="info">{pillars.length}</Badge>
              </span>
            }
          />
        </div>
        {pillars.length === 0 ? (
          <div className="px-4 py-6" data-testid="library-pillar-empty">
            <EmptyState
              icon={<Layers className="h-8 w-8" aria-hidden="true" />}
              title={t("users.library.pillarsEmpty")}
              description={t("users.library.pillarsEmptyDescription")}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              getRowKey={(p) => p.id}
              getRowTestId={(p) => `library-pillar-${p.id}`}
              rows={pillars}
              columns={pillarColumns(canEditLibrary, slug, t)}
            />
          </div>
        )}
        {canEditLibrary ? (
          <div className="border-border border-t px-4 py-3">
            <NewPillarForm slug={slug} />
          </div>
        ) : null}
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="border-border border-b px-4 py-3">
          <SectionHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Layers className="text-fg-secondary h-4 w-4" aria-hidden="true" />
                {t("users.library.templates")}
                <Badge variant="info">{templates.length}</Badge>
              </span>
            }
          />
        </div>
        {templates.length === 0 ? (
          <div className="px-4 py-6" data-testid="library-template-empty">
            <EmptyState
              icon={<Layers className="h-8 w-8" aria-hidden="true" />}
              title={t("users.library.templatesEmpty")}
              description={t("users.library.templatesEmptyDescription")}
            />
          </div>
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
                {canEditLibrary ? <ArchiveTemplateButton slug={slug} id={row.id} /> : null}
              </li>
            ))}
          </ul>
        )}
        {canEditLibrary ? (
          <div className="border-border border-t px-4 py-3">
            <NewTemplateForm slug={slug} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function formatCampaignWindow(
  start: Date | string | null,
  end: Date | string | null,
  t: (key: string, params?: Record<string, string | number>) => string,
  code: import("@/lib/i18n/locales").LocaleCode,
): string {
  const fmt = (d: Date | string) => {
    const date = typeof d === "string" ? new Date(d) : d;
    return formatDate(date, code, { month: "short", day: "numeric" });
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return t("users.library.windowFrom", { date: fmt(start) });
  if (end) return t("users.library.windowUntil", { date: fmt(end) });
  return t("users.library.windowNone");
}

function pillarColumns(
  canEditLibrary: boolean,
  slug: string,
  t: (key: string) => string,
): DataTableColumnDef<typeof contentPillars.$inferSelect>[] {
  return [
    {
      key: "name",
      header: t("users.library.colPillar"),
      cell: (p) => <span className="text-body text-fg-primary font-medium">{p.name}</span>,
    },
    {
      key: "description",
      header: t("users.library.colDescription"),
      cell: (p) =>
        p.description ? (
          <span className="text-body text-fg-secondary">{p.description}</span>
        ) : (
          <span className="text-fg-muted">&mdash;</span>
        ),
    },
    ...(canEditLibrary
      ? [
          {
            key: "actions",
            header: t("users.library.colActions"),
            cell: (p: typeof contentPillars.$inferSelect) => (
              <ArchivePillarButton slug={slug} id={p.id} />
            ),
          },
        ]
      : []),
  ];
}
