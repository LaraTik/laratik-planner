import { redirect, notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Clock, ExternalLink, MoreHorizontal, PlugZap, Radio } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { socialChannels } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { hasAgencyProviderConfig } from "@/lib/social/provider-config";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/workspace/page-header";
import { PlatformIcon, platformLabel } from "@/components/workspace/platform-icon";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { ConnectionStatusBadge } from "./connection-status-badge";
import { ConnectionActions } from "./connection-actions";
import { AddChannelButton } from "./add-channel-button";
import { ChannelForm } from "./channel-form";
import { ChannelRowActions } from "./channel-edit-drawer";

type ChannelRow = typeof socialChannels.$inferSelect;

/**
 * Column definitions for the channels table. Hoisted out of the page
 * so the JSX stays focused on data + layout. Row actions render
 * through the `ChannelRowActions` client component (kebab menu +
 * edit drawer + archive confirm) for manual channels, and through
 * the `ConnectionActions` client component for connected channels.
 */
function channelsColumns(props: {
  slug: string;
  canManage: boolean;
  affectedByConnection: Record<
    string,
    Array<{ id: string; accountName: string; platform: "instagram" | "facebook" | "tiktok" }>
  >;
}): DataTableColumnDef<ChannelRow>[] {
  return [
    {
      key: "platform",
      header: "Platform",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <PlatformIcon platform={row.platform} tile />
          <span className="text-body text-fg-primary font-medium">
            {platformLabel(row.platform)}
          </span>
        </div>
      ),
    },
    {
      key: "account",
      header: "Account",
      cell: (row) => (
        <div className="text-body text-fg-primary flex flex-col">
          <span className="font-medium">{row.accountName}</span>
          {row.handle ? <span className="text-label text-fg-muted">@{row.handle}</span> : null}
        </div>
      ),
    },
    {
      key: "url",
      header: "Profile URL",
      hideOn: "lg",
      cellClassName: "text-body text-fg-muted hidden max-w-[200px] truncate lg:table-cell",
      cell: (row) =>
        row.url ? (
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
        ),
    },
    {
      key: "state",
      header: "State",
      cell: (row) => (
        <ConnectionStatusBadge
          status={
            (row.connectionStatus ?? "manual") as
              "manual" | "connected" | "needs_reauth" | "sync_error" | "disconnected"
          }
          lastSyncedAt={row.lastSyncedAt}
        />
      ),
    },
    {
      key: "owner",
      header: "Owner / Contact",
      hideOn: "md",
      cell: (row) => row.accountType || <span className="text-fg-muted">&mdash;</span>,
    },
    {
      key: "updated",
      header: "Last updated",
      hideOn: "xl",
      cell: (row) => formatRelativeDate(row.updatedAt),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-12",
      cellClassName: "text-right",
      cell: (row) => {
        if (!props.canManage) {
          return (
            <span aria-hidden="true" className="inline-flex h-10 w-10 items-center justify-center">
              <MoreHorizontal className="text-fg-muted h-4 w-4" />
            </span>
          );
        }
        if (!row.socialConnectionId) {
          return (
            <ChannelRowActions
              slug={props.slug}
              channel={{
                id: row.id,
                platform: row.platform,
                accountName: row.accountName,
                handle: row.handle,
                url: row.url,
                accountType: row.accountType,
                isActive: row.isActive,
                socialConnectionId: row.socialConnectionId,
                lastSyncedAt: row.lastSyncedAt,
                lastSyncErrorCode: row.lastSyncErrorCode,
                lastSyncErrorAt: row.lastSyncErrorAt,
                connectionStatus:
                  (row.connectionStatus as
                    "manual" | "connected" | "needs_reauth" | "sync_error" | "disconnected") ??
                  "manual",
              }}
            />
          );
        }
        const affected = props.affectedByConnection[row.socialConnectionId] ?? [];
        return (
          <ConnectionActions
            slug={props.slug}
            channel={{
              id: row.id,
              accountName: row.accountName,
              platform: (row.platform as "instagram" | "facebook" | "tiktok") ?? "instagram",
              socialConnectionId: row.socialConnectionId,
              connectionStatus:
                (row.connectionStatus as
                  "manual" | "connected" | "needs_reauth" | "sync_error" | "disconnected") ??
                "connected",
            }}
            affectedChannels={affected}
          />
        );
      },
    },
  ];
}

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
  // M4.6 — gate the "Connect Meta" card on the agency's per-agency
  // provider config. Hard cutover: no env fallback. If the agency
  // has not configured Meta yet, the card becomes a setup banner
  // pointing at the agency-settings page.
  const hasMetaConfig = canManage
    ? await hasAgencyProviderConfig(db, workspace.agencyId, "meta")
    : false;
  const rows = await db
    .select()
    .from(socialChannels)
    .where(and(eq(socialChannels.workspaceId, workspace.id), isNull(socialChannels.archivedAt)))
    .orderBy(desc(socialChannels.isActive), desc(socialChannels.updatedAt));
  // Build the affected-channels map: for every connection that has
  // more than one attached channel, list those channels. The revoke
  // dialog uses this list to show the operator exactly what will be
  // disconnected.
  const affectedByConnection: Record<
    string,
    Array<{ id: string; accountName: string; platform: "instagram" | "facebook" | "tiktok" }>
  > = {};
  for (const row of rows) {
    if (!row.socialConnectionId) continue;
    if (affectedByConnection[row.socialConnectionId]) continue;
    affectedByConnection[row.socialConnectionId] = rows
      .filter((r) => r.socialConnectionId === row.socialConnectionId)
      .map((r) => ({
        id: r.id,
        accountName: r.accountName,
        platform: (r.platform as "instagram" | "facebook" | "tiktok") ?? "instagram",
      }));
  }
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
        action={canManage ? <AddChannelButton formId="channel-add-card" /> : null}
      />

      {canManage ? (
        hasMetaConfig ? (
          <Card padding="md" data-testid="connect-meta-card">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-body text-fg-primary font-semibold">Connect a Meta account</h3>
                <p className="text-label text-fg-muted mt-1">
                  Authorize Facebook Pages and any linked Instagram professional accounts. Read-only
                  — no publishing, no ads.
                </p>
              </div>
              <form action="/api/social/meta/connect" method="POST">
                <input type="hidden" name="slug" value={slug} />
                <Button type="submit" variant="secondary" data-testid="connect-meta-button">
                  <PlugZap className="h-4 w-4" aria-hidden={true} /> Connect Meta
                </Button>
              </form>
            </div>
          </Card>
        ) : (
          <Card padding="md" data-testid="setup-meta-card">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-body text-fg-primary font-semibold">Connect a Meta account</h3>
                <p className="text-label text-fg-muted mt-1">
                  An agency admin needs to add Meta app credentials before the workspace can connect
                  a Meta account. The setup is per-agency and takes one minute.
                </p>
              </div>
              <a
                href="/app/agency-settings/social/providers"
                className="border-border bg-surface text-fg-primary text-body hover:bg-surface-subtle inline-flex items-center gap-2 rounded-[var(--radius-control)] border px-4 py-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
                data-testid="setup-meta-cta"
              >
                <PlugZap className="h-4 w-4" aria-hidden={true} /> Set up Meta
              </a>
            </div>
          </Card>
        )
      ) : null}

      {canManage ? <ChannelForm slug={slug} /> : null}

      {rows.length ? (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <DataTable
              data-testid="channels-table"
              getRowKey={(row) => row.id}
              getRowTestId={(row) => `channel-row-${row.id}`}
              rows={rows}
              columns={channelsColumns({
                slug,
                canManage,
                affectedByConnection: affectedByConnection,
              })}
            />
          </div>
        </Card>
      ) : (
        <Card variant="dashed" padding="lg" data-testid="channels-empty-state">
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
