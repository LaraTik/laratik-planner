import { redirect, notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Clock, ExternalLink, MoreHorizontal, Radio } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { socialChannels } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/workspace/page-header";
import { PlatformIcon, platformLabel } from "@/components/workspace/platform-icon";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { AddChannelButton } from "./add-channel-button";
import { ChannelForm } from "./channel-form";
import { ChannelRowActions } from "./channel-edit-drawer";

type ChannelRow = typeof socialChannels.$inferSelect;

/**
 * Column definitions for the channels table. Hoisted out of the page
 * so the JSX stays focused on data + layout. Row actions render
 * through the `ChannelRowActions` client component (kebab menu +
 * edit drawer + archive confirm).
 */
function channelsColumns(props: {
  slug: string;
  canManage: boolean;
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
      cell: (row) =>
        row.isActive ? (
          <Badge variant="success">
            <span className="bg-success h-1.5 w-1.5 rounded-full" aria-hidden="true" />
            Active
          </Badge>
        ) : (
          <Badge variant="outline">
            <span className="bg-fg-secondary h-1.5 w-1.5 rounded-full" aria-hidden="true" />
            Inactive
          </Badge>
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
      cell: (row) =>
        props.canManage ? (
          <ChannelRowActions slug={props.slug} channel={row} />
        ) : (
          <span aria-hidden="true" className="inline-flex h-10 w-10 items-center justify-center">
            <MoreHorizontal className="text-fg-muted h-4 w-4" />
          </span>
        ),
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
        action={canManage ? <AddChannelButton formId="channel-add-card" /> : null}
      />

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
