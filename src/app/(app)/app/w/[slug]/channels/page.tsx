import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, desc, eq, isNull } from "drizzle-orm";
import { AlertCircle, Clock, ExternalLink, MoreHorizontal, PlugZap, Radio } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { socialChannels } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { hasAgencyProviderConfig } from "@/lib/social/provider-config";
import { findPendingConnectionForWorkspace } from "@/lib/social/repository";
import { getMetaPublishingReadinessForWorkspace } from "@/lib/social/publishing-readiness-service";
import { tForActive } from "@/lib/i18n/t-for-active";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/workspace/page-header";
import { PlatformIcon, platformLabel } from "@/components/workspace/platform-icon";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import type { LocaleCode } from "@/lib/i18n/locales";
import { ConnectionStatusBadge } from "./connection-status-badge";
import { ConnectionActions } from "./connection-actions";
import { AddChannelButton } from "./add-channel-button";
import { ChannelForm } from "./channel-form";
import { ChannelRowActions } from "./channel-edit-drawer";
import { MetaAccountPicker } from "./meta-account-picker";
import { MetaConnectButton } from "./meta-connect-button";
import { MetaPublishingReadinessCard } from "@/components/workspace/meta-publishing-readiness-card";
import { metaPublishingReadinessCopy } from "@/lib/social/publishing-readiness-copy";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("sidebar.channels") };
}

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
  t: (key: string) => string;
  locale: LocaleCode;
}): DataTableColumnDef<ChannelRow>[] {
  return [
    {
      key: "platform",
      header: props.t("users.channels.colPlatform"),
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
      header: props.t("users.channels.colAccount"),
      cell: (row) => (
        <div className="text-body text-fg-primary flex flex-col">
          <span className="font-medium">{row.accountName}</span>
          {row.handle ? <span className="text-label text-fg-muted">@{row.handle}</span> : null}
        </div>
      ),
    },
    {
      key: "url",
      header: props.t("users.channels.colUrl"),
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
      header: props.t("users.channels.colState"),
      cell: (row) => (
        <ConnectionStatusBadge
          status={
            (row.connectionStatus ?? "manual") as
              "manual" | "connected" | "needs_reauth" | "sync_error" | "disconnected"
          }
          lastSyncedAt={row.lastSyncedAt}
          locale={props.locale}
          t={props.t}
        />
      ),
    },
    {
      key: "owner",
      header: props.t("users.channels.colOwner"),
      hideOn: "md",
      cell: (row) => row.accountType || <span className="text-fg-muted">&mdash;</span>,
    },
    {
      key: "updated",
      header: props.t("users.channels.colUpdated"),
      hideOn: "xl",
      cell: (row) => formatRelativeDate(row.updatedAt, new Date(), props.locale),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-12",
      cellClassName: "text-end",
      cell: (row) => {
        if (!props.canManage) {
          return (
            <span aria-hidden="true" className="inline-flex h-10 w-10 items-center justify-center">
              <MoreHorizontal className="text-fg-muted h-4 w-4" aria-hidden="true" />
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
export default async function ChannelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    meta_error?: string | string[];
    meta_error_description?: string | string[];
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const sp = await searchParams;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const { t, code } = await tForActive();
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
  // M4 — pending-selection picker. When the OAuth callback creates a
  // `pending_selection` connection (the user just clicked "Connect
  // Meta", authorized, and got redirected back), the channels page
  // renders the picker so the user can pick which Pages / IG
  // accounts to link. Pre-2026-08-28 bug: the picker was dead code
  // because the channels page never queried for the pending
  // connection, and the profile list was lost after the callback.
  // The fix on the callback side persists the profile list to
  // `connection.metadata.discoveredProfiles`; this function reads
  // it and renders the picker with a candidates list of existing
  // channels whose `external_account_id` matches.
  const pending = canManage ? await findPendingConnectionForWorkspace(db, workspace.id) : null;
  // A detached channel keeps its provider account ID so it can be matched
  // against the next OAuth discovery result. Use the missing connection
  // relation as the durable reconnect signal; older rows may have stale or
  // inconsistent status metadata after a grant was revoked.
  const isReconnectableMetaChannel = (row: ChannelRow) =>
    (row.platform === "facebook" || row.platform === "instagram") &&
    row.externalAccountId !== null &&
    row.socialConnectionId === null &&
    row.connectionStatus !== "manual";
  const reconnectableCount = rows.filter(isReconnectableMetaChannel).length;
  const metaPublishingReadiness = await getMetaPublishingReadinessForWorkspace(
    workspace.agencyId,
    workspace.id,
  );
  const candidates = pending
    ? rows
        .filter(
          (r) => r.socialConnectionId !== pending.connection.id && r.externalAccountId !== null,
        )
        .map((r) => ({
          providerAccountId: r.externalAccountId as string,
          channelId: r.id,
          accountName: r.accountName,
          alreadyConnected: r.socialConnectionId !== null,
          previouslyConnected: isReconnectableMetaChannel(r),
        }))
    : [];
  // Surface the OAuth error code set by the callback when the user
  // is denied or Meta returns a non-2xx. Codes: `access_denied` (the
  // user declined the dialog), `not_configured` (agency has no
  // provider row), `missing_code` (Meta returned without a code),
  // `provider_error` / `exchange_failed` (the code→token exchange
  // failed). The `meta_error_description` is optional and capped at
  // 200 chars by the callback.
  const metaErrorRaw = sp.meta_error;
  const metaError = Array.isArray(metaErrorRaw) ? metaErrorRaw[0] : metaErrorRaw;
  const metaErrorDescRaw = sp.meta_error_description;
  const metaErrorDescription = Array.isArray(metaErrorDescRaw)
    ? metaErrorDescRaw[0]
    : metaErrorDescRaw;
  const META_ERROR_KEY: Record<string, string> = {
    access_denied: "users.channels.metaErrorAccessDenied",
    not_configured: "users.channels.metaErrorNotConfigured",
    missing_code: "users.channels.metaErrorMissingCode",
    provider_error: "users.channels.metaErrorProviderError",
    exchange_failed: "users.channels.metaErrorExchangeFailed",
    invalid_state: "users.channels.metaErrorInvalidState",
  };
  const metaErrorMessage = metaError
    ? t(META_ERROR_KEY[metaError] ?? "users.channels.metaErrorGeneric", { code: metaError })
    : null;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title={t("users.channels.title")}
        description={
          <>
            {t("users.channels.description")}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
        action={canManage ? <AddChannelButton formId="channel-add-card" /> : null}
      />

      {metaErrorMessage ? (
        <div
          role="alert"
          aria-live="polite"
          data-testid="meta-callback-error"
          className="border-danger/40 bg-danger/5 text-danger flex items-start gap-3 rounded-md border px-3 py-2"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium">{metaErrorMessage}</p>
            {metaErrorDescription ? (
              <p className="text-label text-fg-muted mt-0.5">{metaErrorDescription}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <MetaPublishingReadinessCard
        readiness={metaPublishingReadiness}
        copy={metaPublishingReadinessCopy(metaPublishingReadiness, t)}
      />

      {pending ? (
        <MetaAccountPicker
          connectionId={pending.connection.id}
          profiles={pending.profiles.map((p) => ({
            providerAccountId: p.providerAccountId,
            platform: p.platform,
            accountName: p.accountName,
            handle: p.handle,
            profileUrl: p.profileUrl,
            avatarUrl: p.avatarUrl,
            parentProviderAccountId: p.parentProviderAccountId,
          }))}
          candidates={candidates}
          slug={slug}
          copy={{
            title: t("common.metaPublishing.picker.title"),
            description: t("common.metaPublishing.picker.description"),
            reconnectTitle: t("common.metaPublishing.picker.reconnectTitle"),
            reconnectDescription: t("common.metaPublishing.picker.reconnectDescription"),
            reconnectButton: t("common.metaPublishing.picker.reconnectButton"),
            reviewAccounts: t("common.metaPublishing.picker.reviewAccounts"),
            reconnecting: t("common.metaPublishing.picker.reconnecting"),
            bulkSelection: t("common.metaPublishing.picker.bulkSelection"),
            selectAll: t("common.metaPublishing.picker.selectAll"),
            unselectAll: t("common.metaPublishing.picker.unselectAll"),
            selectAccount: t("common.metaPublishing.picker.selectAccount"),
            alreadyConnected: t("common.metaPublishing.picker.alreadyConnected"),
            linkedTo: t("common.metaPublishing.picker.linkedTo"),
            willLink: t("common.metaPublishing.picker.willLink"),
            willCreate: t("common.metaPublishing.picker.willCreate"),
            selected: t("common.metaPublishing.picker.selected"),
            linking: t("common.metaPublishing.picker.linking"),
            linkSelected: t("common.metaPublishing.picker.linkSelected"),
            pickOne: t("common.metaPublishing.picker.pickOne"),
            platformLabels: {
              facebook: t("common.metaPublishing.picker.facebook"),
              instagram: t("common.metaPublishing.picker.instagram"),
              tiktok: t("common.metaPublishing.picker.tiktok"),
            },
          }}
        />
      ) : null}

      {canManage ? (
        hasMetaConfig ? (
          <Card padding="md" data-testid="connect-meta-card">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-body text-fg-primary font-semibold">
                  {reconnectableCount > 0
                    ? t("users.channels.reconnectMetaTitle")
                    : t("users.channels.connectMetaTitle")}
                </h3>
                <p className="text-label text-fg-muted mt-1">
                  {reconnectableCount > 0
                    ? t("users.channels.reconnectMetaDescription", { count: reconnectableCount })
                    : t("users.channels.connectMetaDescription")}
                </p>
              </div>
              <MetaConnectButton
                slug={slug}
                label={
                  reconnectableCount > 0
                    ? t("users.channels.reconnectMetaButton")
                    : t("users.channels.connectMetaButton")
                }
                pendingLabel={t("users.channels.metaConnectPending")}
                errorLabel={t("users.channels.metaConnectError")}
                testId={reconnectableCount > 0 ? "reconnect-meta-button" : "connect-meta-button"}
              />
            </div>
          </Card>
        ) : (
          <Card padding="md" data-testid="setup-meta-card">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-body text-fg-primary font-semibold">
                  {t("users.channels.connectMetaTitle")}
                </h3>
                <p className="text-label text-fg-muted mt-1">
                  {t("users.channels.setupMetaDescription")}
                </p>
              </div>
              <a
                href="/app/agency-settings/social/providers"
                className="border-border bg-surface text-fg-primary text-body hover:bg-surface-subtle inline-flex items-center gap-2 rounded-[var(--radius-control)] border px-4 py-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
                data-testid="setup-meta-cta"
              >
                <PlugZap className="h-4 w-4" aria-hidden={true} />{" "}
                {t("users.channels.setupMetaButton")}
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
                t,
                locale: code,
              })}
            />
          </div>
        </Card>
      ) : (
        <Card variant="dashed" padding="lg" data-testid="channels-empty-state">
          <EmptyState
            icon={<Radio className="h-8 w-8" />}
            title={t("users.channels.emptyTitle")}
            description={
              canManage ? t("users.channels.adminEmpty") : t("users.channels.memberEmpty")
            }
          />
        </Card>
      )}
    </div>
  );
}
