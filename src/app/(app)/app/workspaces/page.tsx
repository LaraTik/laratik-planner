import Link from "next/link";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { Folder, Lightbulb, Plus, Send, AlertTriangle, Building } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { contentItems, socialChannels, workspaces, workspaceMemberships } from "@/lib/db/schema";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { EmptyState } from "@/components/feedback/empty-state";
import { IconTile } from "@/components/workspace/icon-button";
import { KpiTile } from "@/components/workspace/kpi-tile";
import { PageHeader } from "@/components/workspace/page-header";
import { PlatformIcon, platformLabel } from "@/components/workspace/platform-icon";
import { WorkspaceRowActions } from "@/components/workspace/workspace-row-actions";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";

/**
 * Workspaces index (M3.6) — Stitch-aligned table view of all
 * workspaces the user can see in the current agency.
 *
 * Stitch design (project 5403097764334458790, screen `01aa8faf`):
 *   header: "Workspaces" + description
 *   KPI strip: Active brands / Ideas this month / Need review / Ready
 *   table: Brand | Channels | Members | Last activity | Row actions
 *
 * Rows are clickable; secondary actions (open, settings, team,
 * channels) live in a kebab menu so the row stays scannable.
 */
export const metadata = { title: "Workspaces" };

export default async function WorkspacesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const actor = await currentActor();
  if (!actor) return null;
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) return null;
  const isAdmin = await isAgencyAdmin(actor, agencyId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nowMs = now.getTime();

  // Base rows — admin sees every workspace in the agency, members see
  // only the workspaces they belong to.
  const baseQuery = db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      status: workspaces.status,
      updatedAt: workspaces.updatedAt,
    })
    .from(workspaces)
    .where(and(eq(workspaces.agencyId, agencyId), isNull(workspaces.archivedAt)))
    .orderBy(desc(workspaces.updatedAt));

  const rows = isAdmin
    ? await baseQuery
    : await db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
          status: workspaces.status,
          updatedAt: workspaces.updatedAt,
        })
        .from(workspaces)
        .innerJoin(
          workspaceMemberships,
          and(
            eq(workspaceMemberships.workspaceId, workspaces.id),
            eq(workspaceMemberships.userId, session.user.id),
            eq(workspaceMemberships.status, "active"),
          ),
        )
        .where(and(eq(workspaces.agencyId, agencyId), isNull(workspaces.archivedAt)))
        .orderBy(desc(workspaces.updatedAt));

  // Per-workspace aggregates: channels + members.
  const workspaceIds = rows.map((r) => r.id);
  const channelCounts = new Map<string, number>();
  const memberCounts = new Map<string, number>();
  const sampleChannels = new Map<string, string[]>();
  if (workspaceIds.length) {
    const channelRows = await db
      .select({
        workspaceId: socialChannels.workspaceId,
        platform: socialChannels.platform,
      })
      .from(socialChannels)
      .where(
        and(
          inArray(socialChannels.workspaceId, workspaceIds),
          eq(socialChannels.isActive, true),
          isNull(socialChannels.archivedAt),
        ),
      );
    for (const row of channelRows) {
      channelCounts.set(row.workspaceId, (channelCounts.get(row.workspaceId) ?? 0) + 1);
      const list = sampleChannels.get(row.workspaceId) ?? [];
      if (list.length < 3) list.push(row.platform);
      sampleChannels.set(row.workspaceId, list);
    }
    const memberRows = await db
      .select({
        workspaceId: workspaceMemberships.workspaceId,
      })
      .from(workspaceMemberships)
      .where(
        and(
          inArray(workspaceMemberships.workspaceId, workspaceIds),
          eq(workspaceMemberships.status, "active"),
        ),
      );
    for (const row of memberRows) {
      memberCounts.set(row.workspaceId, (memberCounts.get(row.workspaceId) ?? 0) + 1);
    }
  }

  // Agency-wide KPI strip (Stitch top row)
  const agencyKpis = workspaceIds.length
    ? await db
        .select({
          status: contentItems.status,
        })
        .from(contentItems)
        .where(
          and(inArray(contentItems.workspaceId, workspaceIds), isNull(contentItems.archivedAt)),
        )
    : [];
  const totalIdeas = agencyKpis.length;
  const needsReview = agencyKpis.filter(
    (i) => i.status === "content_review" || i.status === "creative_review",
  ).length;
  const readyToPublish = agencyKpis.filter((i) => i.status === "ready_to_publish").length;
  // Suppress unused — `monthStart` reserved for date-bucketed ideas count.
  void monthStart;
  void nowMs;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workspaces"
        description={
          isAdmin
            ? "One workspace per brand keeps channels, team access, and planning separate. Create a new one to onboard a client brand."
            : "Workspaces you're a member of. Each one is a separate brand environment."
        }
        action={
          isAdmin ? (
            <Button asChild>
              <Link href="/app/workspaces/new">
                <Plus className="h-4 w-4" aria-hidden="true" />
                New workspace
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="workspaces-kpi-row">
        <KpiTile
          icon={<Building className="h-4 w-4" aria-hidden="true" />}
          label="Active brands"
          value={rows.length}
        />
        <KpiTile
          icon={<Lightbulb className="h-4 w-4" aria-hidden="true" />}
          label="Total ideas"
          value={totalIdeas}
        />
        <KpiTile
          icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          label="Need review"
          value={needsReview}
          tone="warning"
        />
        <KpiTile
          icon={<Send className="h-4 w-4" aria-hidden="true" />}
          label="Ready to publish"
          value={readyToPublish}
          tone="success"
        />
      </div>

      {rows.length === 0 ? (
        <Card variant="dashed" padding="lg">
          <EmptyState
            icon={<Folder className="h-8 w-8" aria-hidden="true" />}
            title="No workspaces yet"
            description={
              isAdmin
                ? "Create the first workspace to start planning content for a client brand."
                : "Ask an admin to add you to a workspace."
            }
            action={
              isAdmin ? (
                <Button asChild>
                  <Link href="/app/workspaces/new">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    New workspace
                  </Link>
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <DataTable
              data-testid="workspaces-table"
              getRowKey={(ws) => ws.id}
              getRowTestId={(ws) => `workspaces-row-${ws.id}`}
              getRowHref={(ws) => `/app/w/${ws.slug}`}
              rows={rows}
              columns={workspacesColumns({
                channelCounts,
                sampleChannels,
                memberCounts,
                canArchive: isAdmin,
                canEditSettings: isAdmin,
              })}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "archived";
  updatedAt: Date;
};
type ChannelCountMap = Map<string, number>;
type SampleChannelMap = Map<string, string[]>;
type MemberCountMap = Map<string, number>;

function workspacesColumns(props: {
  channelCounts: ChannelCountMap;
  sampleChannels: SampleChannelMap;
  memberCounts: MemberCountMap;
  canArchive: boolean;
  canEditSettings: boolean;
}): DataTableColumnDef<WorkspaceRow>[] {
  return [
    {
      key: "brand",
      header: "Brand",
      headerClassName: "w-1/3",
      cell: (ws) => (
        <div className="flex items-center gap-3">
          <IconTile size="md" tone="primary" aria-hidden="true">
            {ws.name.charAt(0).toUpperCase()}
          </IconTile>
          <div className="min-w-0">
            <Link
              href={`/app/w/${ws.slug}`}
              className="text-body text-fg-primary hover:text-primary block truncate font-semibold"
            >
              {ws.name}
            </Link>
            <p className="text-label text-fg-muted truncate">{ws.slug}.planner.laratik.com</p>
          </div>
        </div>
      ),
    },
    {
      key: "channels",
      header: "Channels",
      cell: (ws) => {
        const channelCount = props.channelCounts.get(ws.id) ?? 0;
        const samples = props.sampleChannels.get(ws.id) ?? [];
        if (channelCount === 0) {
          return <span className="text-fg-muted">No channels</span>;
        }
        return (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1">
              {samples.map((p) => (
                <span
                  key={p}
                  className="border-border bg-surface ring-surface inline-flex h-6 w-6 items-center justify-center rounded-full border ring-1"
                  title={platformLabel(p)}
                >
                  <PlatformIcon platform={p} className="h-3 w-3" />
                </span>
              ))}
            </div>
            <span className="text-label text-fg-secondary">
              {channelCount} channel{channelCount === 1 ? "" : "s"}
            </span>
          </div>
        );
      },
    },
    {
      key: "members",
      header: "Members",
      cell: (ws) => {
        const memberCount = props.memberCounts.get(ws.id) ?? 0;
        return (
          <span className="text-body text-fg-primary font-medium">
            {memberCount} member{memberCount === 1 ? "" : "s"}
          </span>
        );
      },
    },
    {
      key: "last-activity",
      header: "Last activity",
      cell: (ws) => formatRelativeDate(ws.updatedAt),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-12",
      cellClassName: "text-end",
      cell: (ws) => (
        <WorkspaceRowActions
          slug={ws.slug}
          name={ws.name}
          canArchive={props.canArchive}
          canEditSettings={props.canEditSettings}
        />
      ),
    },
  ];
}
