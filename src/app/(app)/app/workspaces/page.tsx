import Link from "next/link";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { Folder, Lightbulb, Plus, Send, AlertTriangle, Building } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { contentItems, socialChannels, workspaces, workspaceMemberships } from "@/lib/db/schema";
import { activeAgencyId, isAgencyAdmin } from "@/lib/auth/policy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { IconTile } from "@/components/workspace/icon-button";
import { PageHeader } from "@/components/workspace/page-header";
import { PlatformIcon, platformLabel } from "@/components/workspace/platform-icon";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";

/**
 * Workspaces index (M3.6) — Stitch-aligned table view of all
 * workspaces the user can see in the current agency.
 *
 * Stitch design (project 5403097764334458790, screen `01aa8faf`):
 *   header: "Workspaces" + description
 *   KPI strip: Active brands / Ideas this month / Need review / Ready
 *   table: Brand | Channels | Members | Coverage | Health | Next publish | Actions
 *
 * v1 ships the table (Brand / Channels / Members / Last active) + an
 * agency-wide KPI strip. Coverage, Health and Next publish columns
 * need a per-workspace aggregation that v1 doesn't run inline; they
 * land in a follow-up that uses the workspace overview metrics
 * service. Today's goal is a Stitch-faithful shape, not a byte-faithful
 * one.
 */
export const metadata = { title: "Workspaces" };

export default async function WorkspacesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const agencyId = await activeAgencyId();
  if (!agencyId) return null;
  const isAdmin = await isAgencyAdmin({ id: session.user.id }, agencyId);
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
          icon={<AlertTriangle className="text-warning h-4 w-4" aria-hidden="true" />}
          label="Need review"
          value={needsReview}
          tone="warning"
        />
        <KpiTile
          icon={<Send className="text-success h-4 w-4" aria-hidden="true" />}
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
            <table className="w-full border-collapse text-left" data-testid="workspaces-table">
              <thead>
                <tr className="bg-surface-subtle border-border border-b">
                  <th className="text-label text-fg-secondary w-1/3 px-4 py-3 font-semibold tracking-wide uppercase">
                    Brand
                  </th>
                  <th className="text-label text-fg-secondary px-4 py-3 font-semibold tracking-wide uppercase">
                    Channels
                  </th>
                  <th className="text-label text-fg-secondary px-4 py-3 font-semibold tracking-wide uppercase">
                    Members
                  </th>
                  <th className="text-label text-fg-secondary px-4 py-3 font-semibold tracking-wide uppercase">
                    Last activity
                  </th>
                  <th className="text-label text-fg-secondary w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-border text-table-dense divide-y">
                {rows.map((ws) => {
                  const channelCount = channelCounts.get(ws.id) ?? 0;
                  const memberCount = memberCounts.get(ws.id) ?? 0;
                  const samples = sampleChannels.get(ws.id) ?? [];
                  return (
                    <tr
                      key={ws.id}
                      className="hover:bg-surface-subtle transition-colors"
                      data-testid={`workspaces-row-${ws.id}`}
                    >
                      <td className="px-4 py-3">
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
                            <p className="text-label text-fg-muted truncate">
                              {ws.slug}.planner.laratik.com
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {channelCount === 0 ? (
                          <span className="text-fg-muted">No channels</span>
                        ) : (
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
                        )}
                      </td>
                      <td className="text-body text-fg-primary px-4 py-3 font-medium">
                        {memberCount} member{memberCount === 1 ? "" : "s"}
                      </td>
                      <td className="text-body text-fg-muted px-4 py-3">
                        {formatRelativeDate(ws.updatedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/app/w/${ws.slug}`}>Open</Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "default" | "warning" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "border-l-4 border-l-warning"
      : tone === "success"
        ? "border-l-4 border-l-success"
        : "";
  return (
    <div
      className={`border-border bg-surface rounded-[var(--radius-card)] border p-4 ${toneClass}`}
    >
      <div className="text-fg-muted mb-2 flex items-center gap-2">
        {icon}
        <span className="text-label font-medium">{label}</span>
      </div>
      <p className="text-title-page text-fg-primary font-semibold">{value}</p>
    </div>
  );
}
