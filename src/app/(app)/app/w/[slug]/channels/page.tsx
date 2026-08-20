import { redirect, notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Clock, ExternalLink, MoreHorizontal, Plus, Radio } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { socialChannels } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/workspace/page-header";
import { PlatformIcon, platformLabel } from "@/components/workspace/platform-icon";
import { ChannelForm } from "./channel-form";
import { archiveChannelAction } from "./actions";

/**
 * Channels (M3.3) — Stitch-aligned table view of a workspace's social
 * channels. The Stitch design (project 5403097764334458790, screen
 * `45d945d7`) ships a 7-column table — Platform / Account / URL /
 * Default / State / Owner / Last updated — inside a single bordered
 * surface, with a side drawer for "Add channel". v1 keeps the form
 * inline at the top of the page (no Sheet primitive available yet);
 * the table is the primary surface.
 *
 * Auth/authz: same as v0 — `workspace_manager` is required to mutate;
 * viewers can browse.
 */
export default async function ChannelsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const canManage = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
  ]);
  const rows = await db
    .select()
    .from(socialChannels)
    .where(and(eq(socialChannels.workspaceId, workspace.id), isNull(socialChannels.archivedAt)))
    .orderBy(desc(socialChannels.isActive), desc(socialChannels.updatedAt));
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title="Social channels"
        description={
          <>
            Keep the brand&rsquo;s account information in one place. Connections and analytics are
            planned for a future version.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
        action={
          canManage ? (
            <Button type="button" variant="default">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add channel
            </Button>
          ) : null
        }
      />

      {canManage ? <ChannelForm slug={slug} /> : null}

      {rows.length ? (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left" data-testid="channels-table">
              <thead>
                <tr className="bg-surface-subtle border-border border-b">
                  <th className="text-label text-fg-secondary px-4 py-3 font-semibold tracking-wide uppercase">
                    Platform
                  </th>
                  <th className="text-label text-fg-secondary px-4 py-3 font-semibold tracking-wide uppercase">
                    Account
                  </th>
                  <th className="text-label text-fg-secondary hidden px-4 py-3 font-semibold tracking-wide uppercase lg:table-cell">
                    Profile URL
                  </th>
                  <th className="text-label text-fg-secondary px-4 py-3 font-semibold tracking-wide uppercase">
                    State
                  </th>
                  <th className="text-label text-fg-secondary hidden px-4 py-3 font-semibold tracking-wide uppercase md:table-cell">
                    Owner / Contact
                  </th>
                  <th className="text-label text-fg-secondary hidden px-4 py-3 font-semibold tracking-wide uppercase xl:table-cell">
                    Last updated
                  </th>
                  <th className="text-label text-fg-secondary w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-border text-table-dense divide-y">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-surface-subtle transition-colors"
                    data-testid={`channel-row-${row.id}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <PlatformIcon platform={row.platform} tile />
                        <span className="text-body text-fg-primary font-medium">
                          {platformLabel(row.platform)}
                        </span>
                      </div>
                    </td>
                    <td className="text-body text-fg-primary px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium">{row.accountName}</span>
                        {row.handle ? (
                          <span className="text-label text-fg-muted">@{row.handle}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="text-body text-fg-muted hidden max-w-[200px] truncate px-4 py-3 lg:table-cell">
                      {row.url ? (
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-fg-primary inline-flex items-center gap-1"
                        >
                          <span className="truncate">{row.url}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="text-fg-muted">&mdash;</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.isActive ? (
                        <Badge variant="success">
                          <span
                            className="bg-success h-1.5 w-1.5 rounded-full"
                            aria-hidden="true"
                          />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <span
                            className="bg-fg-secondary h-1.5 w-1.5 rounded-full"
                            aria-hidden="true"
                          />
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="text-body text-fg-secondary hidden px-4 py-3 md:table-cell">
                      {row.accountType || <span className="text-fg-muted">&mdash;</span>}
                    </td>
                    <td className="text-body text-fg-muted hidden px-4 py-3 xl:table-cell">
                      {formatRelativeDate(row.updatedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage ? (
                        <form action={archiveChannelAction.bind(null, slug, row.id)}>
                          <Button
                            size="icon"
                            variant="ghost"
                            type="submit"
                            aria-label={`Archive ${row.accountName}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </form>
                      ) : (
                        <span aria-hidden="true">
                          <MoreHorizontal className="text-fg-muted h-4 w-4" />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card variant="dashed" padding="lg">
          <EmptyState
            icon={<Radio className="h-8 w-8" />}
            title="No social channels"
            description={
              canManage
                ? "A workspace manager can add the brand’s accounts here."
                : "Once a workspace manager adds accounts, they will appear in this list."
            }
          />
        </Card>
      )}
    </div>
  );
}

/**
 * Format a `Date` as a short, human-readable relative time stamp.
 * Captured-relative-to-now is good enough for "Last updated" cells —
 * we don't need to ship a full date library for v1.
 */
function formatRelativeDate(date: Date | string): string {
  const ms = typeof date === "string" ? Date.parse(date) : date.getTime();
  if (!Number.isFinite(ms)) return "—";
  const diffMs = Date.now() - ms;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.round(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.round(diffMs / hour)}h ago`;
  if (diffMs < 7 * day) return `${Math.round(diffMs / day)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
