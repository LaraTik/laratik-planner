"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Filter,
  ChevronRight,
  History,
  KeyRound,
  Link2,
  Database,
  Gauge,
  Search,
  Pause,
  Play,
  Plus,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  SlidersHorizontal,
  UsersRound,
  XCircle,
} from "lucide-react";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { PasswordInput } from "@/components/forms/password-input";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DateFormat, formatCurrency, formatDate } from "@/lib/i18n/format-locale";
import { META_DEFAULT_GRAPH_VERSION } from "@/lib/meta/version";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import {
  createAdvertisingConnectionAction,
  grantAdvertisingFinancialAuthorityAction,
  grantAdvertisingVisibilityAction,
  revokeAdvertisingConnectionAction,
  revokeAdvertisingAccountAccessAction,
  revokeAdvertisingFinancialAuthorityAction,
  revokeAdvertisingVisibilityAction,
  storeAdvertisingCredentialAction,
  updateAdvertisingGraphApiVersionAction,
  validateAdvertisingConnectionAction,
  setAdvertisingSyncStateAction,
  type AdvertisingActionState,
} from "./actions";

type Connection = {
  id: string;
  displayName: string;
  provider: string;
  status: string;
  currentCredentialVersion: number;
  lastValidatedAt: string | null;
  lastValidationStatus: string | null;
  lastValidationCode: string | null;
  graphApiVersion: string | null;
  accessTokenLast4: string | null;
  createdAt: string;
};
type AdvertisingAccount = {
  id: string;
  name: string;
  externalAccountId: string;
  currency: string | null;
  timezone: string | null;
  status: string;
};
type Workspace = { id: string; name: string };
type SyncState = {
  id: string;
  connectionId: string;
  accountId: string;
  accountName: string;
  externalAccountId: string;
  status: string;
  lastCompletedAt: string | null;
  nextRunAt: string | null;
  lastErrorCode: string | null;
};
type ConnectionAccount = {
  connectionId: string;
  accountId: string;
  accountName: string;
  externalAccountId: string;
  status: string;
};
type SocialIdentity = {
  id: string;
  connectionId: string;
  accountId: string | null;
  identityType: string;
  externalIdentityId: string;
  displayName: string | null;
  username: string | null;
  status: string;
};
type Capability = {
  id: string;
  connectionId: string;
  accountId: string;
  capability: string;
  status: string;
  checkedAt: Date;
};
type VisibilityGrant = {
  id: string;
  accountId: string;
  accountName: string;
  workspaceId: string | null;
  workspaceName: string | null;
  capability: string;
  campaignIds: string[] | null;
  adSetIds: string[] | null;
  adIds: string[] | null;
  startsAt: string;
  endsAt: string | null;
  revokedAt: string | null;
};
type FinancialAuthority = {
  id: string;
  accountId: string;
  accountName: string;
  workspaceId: string | null;
  workspaceName: string | null;
  startsAt: string;
  endsAt: string | null;
  revokedAt: string | null;
};
type ValidationResult = {
  id: string;
  connectionId: string;
  accountId: string | null;
  operation: string;
  status: string;
  sanitizedCode: string | null;
  retryable: boolean;
  checkedAt: string;
};
type SyncRun = {
  id: string;
  connectionId: string;
  accountId: string;
  accountName: string;
  status: string;
  rowsRead: number;
  rowsWritten: number;
  errorCode: string | null;
  partial: boolean;
  startedAt: string;
  completedAt: string | null;
};
type Reconciliation = {
  id: string;
  accountId: string;
  accountName: string;
  reportDate: string;
  currency: string;
  providerAccountSpend: string;
  canonicalAdSpend: string;
  workspaceAttributedSpend: string;
  unallocatedSpend: string;
  discrepancy: string;
  completeness: string;
  checkedAt: string;
};

const initial: AdvertisingActionState = {};

function stateText(t: (key: string) => string, state: AdvertisingActionState) {
  if (!state.code) return null;
  return t(`advertising.codes.${state.code}`) || t("advertising.codes.advertising_action_failed");
}

export function AdvertisingAdminPanel({
  connections,
  accounts,
  workspaces,
  syncStates,
  connectionAccounts,
  socialIdentities,
  capabilities,
  visibilityGrants = [],
  financialAuthorities = [],
  validationResults = [],
  syncRuns = [],
  reconciliations = [],
  latestReconciliations,
  asOf,
}: {
  connections: readonly Connection[];
  accounts: readonly AdvertisingAccount[];
  workspaces: readonly Workspace[];
  syncStates: readonly SyncState[];
  connectionAccounts: readonly ConnectionAccount[];
  socialIdentities: readonly SocialIdentity[];
  capabilities: readonly Capability[];
  visibilityGrants?: readonly VisibilityGrant[];
  financialAuthorities?: readonly FinancialAuthority[];
  validationResults?: readonly ValidationResult[];
  syncRuns?: readonly SyncRun[];
  reconciliations?: readonly Reconciliation[];
  latestReconciliations?: readonly Reconciliation[];
  asOf: string;
}) {
  const t = useLocaleT();
  const [createState, createAction] = useActionState(createAdvertisingConnectionAction, initial);
  const accountReconciliations = latestReconciliations ?? reconciliations;
  return (
    <div className="space-y-6">
      <AdvertisingSetupSteps
        hasCredential={connections.some((connection) => connection.currentCredentialVersion > 0)}
        hasValidation={connections.some(
          (connection) => connection.lastValidationStatus === "passed",
        )}
        hasAccounts={accounts.length > 0}
        hasWorkspaceAccess={visibilityGrants.some(
          (grant) =>
            grant.capability === "read_reports" &&
            isAdvertisingGrantActive(grant, Date.parse(asOf)),
        )}
        hasReportingSync={syncStates.some(
          (state) => !["paused", "dead_letter"].includes(state.status),
        )}
      />
      <AdvertisingOperatorSummary
        asOf={asOf}
        connections={connections}
        accounts={accounts}
        capabilities={capabilities}
        syncStates={syncStates}
        visibilityGrants={visibilityGrants}
        syncRuns={syncRuns}
        reconciliations={accountReconciliations}
      />
      <AdvertisingCreateCard
        createAction={createAction}
        createState={createState}
        defaultOpen={connections.length === 0}
      />

      <AdvertisingOverviewCard
        asOf={asOf}
        connections={connections}
        accounts={accounts}
        capabilities={capabilities}
        syncStates={syncStates}
        visibilityGrants={visibilityGrants}
      />

      {connections.length === 0 ? (
        <Card variant="subtle" data-testid="advertising-empty">
          <p className="text-body text-fg-secondary">{t("advertising.empty")}</p>
        </Card>
      ) : (
        connections.map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            syncStates={syncStates.filter((state) => state.connectionId === connection.id)}
            connectionAccounts={connectionAccounts.filter(
              (link) => link.connectionId === connection.id,
            )}
            socialIdentities={socialIdentities.filter(
              (identity) => identity.connectionId === connection.id,
            )}
            capabilities={capabilities.filter(
              (capability) => capability.connectionId === connection.id,
            )}
          />
        ))
      )}

      <AdvertisingAccountsTable
        asOf={asOf}
        accounts={accounts}
        connectionAccounts={connectionAccounts}
        syncStates={syncStates}
        capabilities={capabilities}
        visibilityGrants={visibilityGrants}
        reconciliations={accountReconciliations}
      />
      <GrantAccessCard
        accounts={accounts}
        workspaces={workspaces}
        visibilityGrants={visibilityGrants}
        financialAuthorities={financialAuthorities}
      />
      <AdvertisingHistoryCard
        validationResults={validationResults}
        syncRuns={syncRuns}
        connections={connections}
        reconciliations={reconciliations}
      />
    </div>
  );
}

function AdvertisingOperatorSummary({
  asOf,
  connections,
  accounts,
  capabilities,
  syncStates,
  visibilityGrants,
  syncRuns,
  reconciliations,
}: {
  asOf: string;
  connections: readonly Connection[];
  accounts: readonly AdvertisingAccount[];
  capabilities: readonly Capability[];
  syncStates: readonly SyncState[];
  visibilityGrants: readonly VisibilityGrant[];
  syncRuns: readonly SyncRun[];
  reconciliations: readonly Reconciliation[];
}) {
  const t = useLocaleT();
  const validationStatus = (connection: Connection) => connection.lastValidationStatus;
  const latestReconciliation = latestReconciliationByAccount(reconciliations);
  const latestSyncRuns = latestSyncRunByAccount(syncRuns);
  const now = Date.parse(asOf);
  const activeAccounts = accounts.filter((account) => account.status === "active");
  const hasNoReportableAccounts = activeAccounts.length === 0;
  const hasAccountStatusIssue = accounts.some((account) => account.status !== "active");
  const hasMissingReportingCapability = activeAccounts.some(
    (account) =>
      !capabilities.some(
        (capability) =>
          capability.accountId === account.id &&
          capability.capability === "read_reports" &&
          capability.status === "available",
      ),
  );
  const discoveryConnection = connections.find(
    (connection) =>
      connection.status === "active" &&
      connection.currentCredentialVersion > 0 &&
      ["passed", "partial"].includes(validationStatus(connection) ?? ""),
  );
  const connectionMissingCredential = connections.find(
    (connection) => connection.status !== "revoked" && connection.currentCredentialVersion < 1,
  );
  const hasMissingCredential = connectionMissingCredential !== undefined;
  const hasConnectionIssue = connections.some((connection) => connection.status !== "active");
  const hasMissingValidation = connections.some(
    (connection) =>
      connection.status !== "revoked" &&
      connection.currentCredentialVersion > 0 &&
      validationStatus(connection) === null,
  );
  const hasValidationIssue = connections.some((connection) => {
    const status = validationStatus(connection);
    return (
      connection.status !== "revoked" && status !== null && !["passed", "partial"].includes(status)
    );
  });
  const hasPartialValidation = connections.some(
    (connection) => connection.status !== "revoked" && validationStatus(connection) === "partial",
  );
  const nonRevokedConnectionIds = new Set(
    connections
      .filter((connection) => connection.status !== "revoked")
      .map((connection) => connection.id),
  );
  const hasSyncIssue =
    syncStates.some(
      (state) =>
        nonRevokedConnectionIds.has(state.connectionId) &&
        (["failed", "dead_letter"].includes(state.status) || Boolean(state.lastErrorCode)),
    ) ||
    latestSyncRuns.some(
      (run) => nonRevokedConnectionIds.has(run.connectionId) && run.status === "failed",
    );
  const hasPartialSync =
    syncStates.some(
      (state) => nonRevokedConnectionIds.has(state.connectionId) && state.status === "partial",
    ) || latestSyncRuns.some((run) => nonRevokedConnectionIds.has(run.connectionId) && run.partial);
  const hasMissingVisibility = activeAccounts.some(
    (account) =>
      !visibilityGrants.some(
        (grant) =>
          grant.accountId === account.id &&
          grant.capability === "read_reports" &&
          isAdvertisingGrantActive(grant, now),
      ),
  );
  const hasPartialReconciliation = activeAccounts.some(
    (account) => latestReconciliation.get(account.id)?.completeness !== "complete",
  );

  const status =
    connections.length === 0
      ? "notConfigured"
      : hasMissingCredential ||
          hasMissingValidation ||
          hasValidationIssue ||
          hasConnectionIssue ||
          hasSyncIssue ||
          hasMissingVisibility ||
          hasMissingReportingCapability ||
          hasNoReportableAccounts ||
          hasAccountStatusIssue
        ? "needsAttention"
        : hasPartialValidation || hasPartialSync || hasPartialReconciliation
          ? "partial"
          : "ready";
  const statusCopy = {
    ready: {
      label: t("advertising.operatorStatusReady"),
      title: t("advertising.operatorReady"),
      description: t("advertising.operatorReadyDescription"),
      icon: CheckCircle2,
      badge: "success" as const,
    },
    partial: {
      label: t("advertising.operatorStatusPartial"),
      title: t("advertising.operatorPartial"),
      description: t("advertising.operatorPartialDescription"),
      icon: ShieldAlert,
      badge: "warning" as const,
    },
    needsAttention: {
      label: t("advertising.operatorStatusNeedsAttention"),
      title: t("advertising.operatorNeedsAttention"),
      description: t("advertising.operatorNeedsAttentionDescription"),
      icon: AlertTriangle,
      badge: "danger" as const,
    },
    notConfigured: {
      label: t("advertising.operatorStatusNotConfigured"),
      title: t("advertising.operatorNotConfigured"),
      description: t("advertising.operatorNotConfiguredDescription"),
      icon: ShieldAlert,
      badge: "outline" as const,
    },
  }[status];
  const StatusIcon = statusCopy.icon;
  const actions = [
    ...(connections.length === 0 ||
    connections.some((connection) => connection.status === "revoked")
      ? [
          {
            key: "connection",
            label: t("advertising.operatorActionCreateConnection"),
            href: "#advertising-create-card",
          },
        ]
      : []),
    ...(hasMissingCredential
      ? [
          {
            key: "credential",
            label: t("advertising.operatorActionCredential"),
            href: `#advertising-connection-${connectionMissingCredential?.id ?? ""}`,
          },
        ]
      : []),
    ...(hasMissingValidation ||
    hasValidationIssue ||
    hasPartialValidation ||
    hasMissingReportingCapability ||
    connections.some((connection) => connection.status === "invalid")
      ? [
          {
            key: "validation",
            label: t("advertising.operatorActionValidation"),
            href: "#advertising-history-card",
          },
        ]
      : []),
    ...(hasSyncIssue || hasPartialSync
      ? [
          {
            key: "sync",
            label: t("advertising.operatorActionSync"),
            href: "#advertising-history-card",
          },
        ]
      : []),
    ...(hasMissingVisibility
      ? [
          {
            key: "visibility",
            label: t("advertising.operatorActionVisibility"),
            href: "#advertising-grants-card",
          },
        ]
      : []),
    ...(hasPartialReconciliation
      ? [
          {
            key: "reconciliation",
            label: t("advertising.operatorActionReconciliation"),
            href: "#advertising-reconciliation-history",
          },
        ]
      : []),
    ...(hasNoReportableAccounts && discoveryConnection
      ? [
          {
            key: "discoverAccounts",
            label: t("advertising.operatorActionDiscoverAccounts"),
            href: `#advertising-connection-${discoveryConnection.id}`,
          },
        ]
      : []),
    ...(hasAccountStatusIssue
      ? [
          {
            key: "accountStatus",
            label: t("advertising.operatorActionAccountStatus"),
            href: "#advertising-accounts-table-card",
          },
        ]
      : []),
  ];

  return (
    <section
      aria-labelledby="advertising-operator-title"
      data-testid="advertising-operator-summary"
    >
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="bg-primary-subtle text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <StatusIcon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle>{t("advertising.operatorSummaryTitle")}</CardTitle>
              <p
                id="advertising-operator-title"
                className="text-body text-fg-primary mt-2 font-semibold"
              >
                {statusCopy.title}
              </p>
              <p className="text-label text-fg-secondary mt-1 max-w-3xl">
                {statusCopy.description}
              </p>
            </div>
          </div>
          <Badge variant={statusCopy.badge}>{statusCopy.label}</Badge>
        </div>
        <div className="border-border mt-5 border-t pt-4">
          <p className="text-label text-fg-muted font-semibold">
            {t("advertising.operatorNextActions")}
          </p>
          {actions.length === 0 ? (
            <p className="text-label text-fg-secondary mt-2">{t("advertising.operatorNoAction")}</p>
          ) : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {actions.map((action) => (
                <li key={action.key}>
                  <a
                    href={action.href}
                    className="text-primary focus-visible:ring-focus-ring inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 py-2 text-start text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span>{action.label}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </section>
  );
}

function latestReconciliationByAccount(rows: readonly Reconciliation[]) {
  const latest = new Map<string, Reconciliation>();
  for (const row of rows) {
    const current = latest.get(row.accountId);
    if (!current || row.checkedAt > current.checkedAt) latest.set(row.accountId, row);
  }
  return latest;
}

function latestSyncRunByAccount(rows: readonly SyncRun[]) {
  const latest = new Map<string, SyncRun>();
  for (const run of rows) {
    const current = latest.get(run.accountId);
    if (!current || run.startedAt > current.startedAt) latest.set(run.accountId, run);
  }
  return [...latest.values()];
}

function isAdvertisingGrantActive(grant: VisibilityGrant, now: number) {
  return (
    grant.revokedAt === null &&
    Date.parse(grant.startsAt) <= now &&
    now < (grant.endsAt === null ? Number.POSITIVE_INFINITY : Date.parse(grant.endsAt))
  );
}

function AdvertisingSetupSteps({
  hasCredential,
  hasValidation,
  hasAccounts,
  hasWorkspaceAccess,
  hasReportingSync,
}: {
  hasCredential: boolean;
  hasValidation: boolean;
  hasAccounts: boolean;
  hasWorkspaceAccess: boolean;
  hasReportingSync: boolean;
}) {
  const t = useLocaleT();
  const steps = [
    {
      title: t("advertising.setup.step1.title"),
      description: t("advertising.setup.step1.description"),
      complete: hasCredential,
    },
    {
      title: t("advertising.setup.step2.title"),
      description: t("advertising.setup.step2.description"),
      complete: hasValidation,
    },
    {
      title: t("advertising.setup.step3.title"),
      description: t("advertising.setup.step3.description"),
      complete: hasAccounts,
    },
    {
      title: t("advertising.setup.step4.title"),
      description: t("advertising.setup.step4.description"),
      complete: hasWorkspaceAccess,
    },
    {
      title: t("advertising.setup.step5.title"),
      description: t("advertising.setup.step5.description"),
      complete: hasReportingSync,
    },
  ];

  return (
    <Card data-testid="advertising-setup-steps" className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{t("advertising.setup.title")}</CardTitle>
          <CardDescription>{t("advertising.setup.description")}</CardDescription>
        </div>
        <Badge variant="outline">{t("advertising.readOnlyBadge")}</Badge>
      </div>
      <ol className="mt-5 grid gap-4 md:grid-cols-5">
        {steps.map((step, index) => (
          <li key={step.title} className="relative min-w-0">
            {index > 0 ? (
              <span
                className="border-border absolute start-[-1rem] top-4 hidden w-4 border-t md:block"
                aria-hidden="true"
              />
            ) : null}
            <div className="flex items-start gap-3 md:block">
              <div
                className={
                  step.complete
                    ? "border-success bg-success text-primary-foreground text-label flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-semibold"
                    : "border-primary bg-primary-subtle text-primary text-label flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-semibold"
                }
                aria-hidden="true"
              >
                {step.complete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </div>
              <div className="mt-0 md:mt-3">
                <p className="text-body text-fg-primary font-semibold">{step.title}</p>
                <p className="text-label text-fg-muted mt-1 leading-5">{step.description}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function AdvertisingCreateCard({
  createAction,
  createState,
  defaultOpen,
}: {
  createAction: (formData: FormData) => void;
  createState: AdvertisingActionState;
  defaultOpen: boolean;
}) {
  const t = useLocaleT();
  return (
    <details
      id="advertising-create-card"
      data-testid="advertising-create-card"
      className="border-primary/15 bg-primary-subtle/30 rounded-[var(--radius-card)] border"
      open={defaultOpen || undefined}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <CardTitle>{t("advertising.createTitle")}</CardTitle>
            <CardDescription>{t("advertising.createDescription")}</CardDescription>
          </div>
        </div>
        <Badge variant="info">{t("advertising.platformOwnedBadge")}</Badge>
      </summary>
      <div className="border-primary/10 bg-surface grid gap-4 border-t p-4 sm:grid-cols-2 sm:p-5">
        <form
          action={createAction}
          className="grid gap-4 sm:col-span-2 sm:grid-cols-2"
          data-testid="advertising-create-form"
        >
          <div className="space-y-1.5">
            <Label htmlFor="advertising-display-name">{t("advertising.displayName")}</Label>
            <Input id="advertising-display-name" name="displayName" required maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="advertising-app-id">{t("advertising.appId")}</Label>
            <Input id="advertising-app-id" name="appId" maxLength={200} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="advertising-graph-version">{t("advertising.graphVersion")}</Label>
            <Input
              id="advertising-graph-version"
              name="graphApiVersion"
              defaultValue={META_DEFAULT_GRAPH_VERSION}
              pattern="v\d+\.\d+"
              maxLength={20}
            />
          </div>
          <div className="flex items-end justify-end">
            <FormSubmitButton
              label={t("advertising.create")}
              pendingLabel={t("advertising.creating")}
            />
          </div>
          {createState.code ? <ActionMessage state={createState} /> : null}
        </form>
      </div>
    </details>
  );
}

function AdvertisingOverviewCard({
  asOf,
  connections,
  accounts,
  capabilities,
  syncStates,
  visibilityGrants,
}: {
  asOf: string;
  connections: readonly Connection[];
  accounts: readonly AdvertisingAccount[];
  capabilities: readonly Capability[];
  syncStates: readonly SyncState[];
  visibilityGrants: readonly VisibilityGrant[];
}) {
  const t = useLocaleT();
  const now = Date.parse(asOf);
  const configuredConnections = connections.filter(
    (connection) => connection.currentCredentialVersion > 0,
  ).length;
  const availableCapabilities = capabilities.filter(
    (capability) => capability.status === "available",
  ).length;
  const activeSyncs = syncStates.filter(
    (state) => !["paused", "dead_letter"].includes(state.status),
  ).length;
  const readyAccounts = accounts.filter((account) =>
    isReportingReady(account, capabilities, visibilityGrants, now),
  ).length;
  const attentionAccounts = Math.max(accounts.length - readyAccounts, 0);
  const metrics = [
    {
      label: t("advertising.overviewConnections"),
      value: connections.length,
      detail: t("advertising.overviewConnectionsDetail", {
        configured: configuredConnections,
        total: connections.length,
      }),
      icon: Gauge,
      tone: "primary",
    },
    {
      label: t("advertising.overviewAccounts"),
      value: accounts.length,
      detail: t("advertising.overviewAccountsDetail"),
      icon: Database,
      tone: "primary",
    },
    {
      label: t("advertising.overviewCapabilities"),
      value: availableCapabilities,
      detail: t("advertising.overviewCapabilitiesDetail", {
        total: capabilities.length,
      }),
      icon: ShieldCheck,
      tone: "primary",
    },
    {
      label: t("advertising.overviewSyncs"),
      value: activeSyncs,
      detail: t("advertising.overviewSyncsDetail"),
      icon: RefreshCw,
      tone: "info",
    },
    {
      label: t("advertising.readyForReporting"),
      value: readyAccounts,
      detail: t("advertising.readyForReportingDetail", { count: accounts.length }),
      icon: CheckCircle2,
      tone: "success",
    },
    {
      label: t("advertising.needsAttention"),
      value: attentionAccounts,
      detail: t("advertising.needsAttentionDetail"),
      icon: AlertTriangle,
      tone: "warning",
    },
  ] as const;

  return (
    <section aria-labelledby="advertising-overview-title" data-testid="advertising-overview">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-label text-primary font-semibold tracking-[0.12em] uppercase">
            {t("advertising.overviewTitle")}
          </p>
          <p id="advertising-overview-title" className="text-body text-fg-secondary mt-1">
            {t("advertising.overviewDescription")}
          </p>
        </div>
        <Badge variant="outline">{t("advertising.readOnlyBadge")}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {metrics.map(({ label, value, detail, icon: Icon, tone }) => (
          <div
            key={label}
            className="border-border bg-surface hover:border-primary/30 flex min-h-32 flex-col justify-between rounded-[var(--radius-card)] border p-4 transition-colors"
          >
            <div className="text-fg-muted flex items-center justify-between gap-2">
              <span className="text-label font-medium">{label}</span>
              <Icon
                className={`h-4 w-4 ${
                  tone === "success"
                    ? "text-success"
                    : tone === "warning"
                      ? "text-warning"
                      : tone === "info"
                        ? "text-info"
                        : "text-primary"
                }`}
                aria-hidden="true"
              />
            </div>
            <div>
              <p className="text-title-page text-fg-primary font-semibold tabular-nums">{value}</p>
              <p className="text-label text-fg-muted">{detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AdvertisingAccountsTable({
  asOf,
  accounts,
  connectionAccounts,
  syncStates,
  capabilities,
  visibilityGrants,
  reconciliations,
}: {
  asOf: string;
  accounts: readonly AdvertisingAccount[];
  connectionAccounts: readonly ConnectionAccount[];
  syncStates: readonly SyncState[];
  capabilities: readonly Capability[];
  visibilityGrants: readonly VisibilityGrant[];
  reconciliations: readonly Reconciliation[];
}) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const now = Date.parse(asOf);
  const [query, setQuery] = React.useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredAccounts = accounts.filter((account) =>
    `${account.name} ${account.externalAccountId}`.toLocaleLowerCase().includes(normalizedQuery),
  );
  const readyCount = accounts.filter((account) =>
    isReportingReady(account, capabilities, visibilityGrants, now),
  ).length;
  const latestReconciliations = latestReconciliationByAccount(reconciliations);

  return (
    <Card
      id="advertising-accounts-table-card"
      data-testid="advertising-accounts-table-card"
      padding="none"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-info-subtle text-info flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <Database className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <CardTitle>{t("advertising.accountsTitle")}</CardTitle>
            <CardDescription>{t("advertising.accountsDescription")}</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t("advertising.readyForReportingDetail", { count: readyCount })}
          </Badge>
          <Badge variant="outline">
            <UsersRound className="h-3.5 w-3.5" aria-hidden="true" />
            {accounts.length}
          </Badge>
        </div>
      </div>

      <div className="border-border bg-surface-subtle/60 flex flex-wrap items-center gap-3 border-y p-3 sm:px-5">
        <div className="relative min-w-56 flex-1">
          <Search
            className="text-fg-muted pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            aria-label={t("advertising.accountSearch")}
            placeholder={t("advertising.accountSearch")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="ps-9"
          />
        </div>
        <Button type="button" variant="secondary" size="sm" disabled>
          <Filter className="h-4 w-4" aria-hidden="true" />
          {t("advertising.accountStatusFilter")}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {t("advertising.accountCapabilityFilter")}
        </Button>
      </div>

      {accounts.length === 0 ? (
        <div className="p-5">
          <p className="text-body text-fg-secondary">{t("advertising.noAccounts")}</p>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="p-5">
          <p className="text-body text-fg-secondary">{t("advertising.accountSearchEmpty")}</p>
        </div>
      ) : (
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label={t("advertising.accountTableLabel")}
        >
          <table className="w-full min-w-[900px] text-start">
            <thead className="bg-surface-subtle/40">
              <tr className="border-border border-b">
                <th className="text-label text-fg-muted px-5 py-3 font-semibold" scope="col">
                  {t("advertising.accountTableAccount")}
                </th>
                <th className="text-label text-fg-muted px-3 py-3 font-semibold" scope="col">
                  {t("advertising.accountTableStatus")}
                </th>
                <th className="text-label text-fg-muted px-3 py-3 font-semibold" scope="col">
                  {t("advertising.accountTableScope")}
                </th>
                <th className="text-label text-fg-muted px-3 py-3 font-semibold" scope="col">
                  {t("advertising.accountTableReporting")}
                </th>
                <th className="text-label text-fg-muted px-3 py-3 font-semibold" scope="col">
                  {t("advertising.accountTableSync")}
                </th>
                <th className="text-label text-fg-muted px-3 py-3 font-semibold" scope="col">
                  {t("advertising.accountTableCompleteness")}
                </th>
                <th className="text-label text-fg-muted px-3 py-3 font-semibold" scope="col">
                  {t("advertising.accountTableLastSync")}
                </th>
                <th
                  className="text-label text-fg-muted px-5 py-3 text-end font-semibold"
                  scope="col"
                >
                  {t("advertising.accountTableActions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account) => {
                const linked = connectionAccounts.find((link) => link.accountId === account.id);
                const sync = syncStates.find((state) => state.accountId === account.id);
                const grants = visibilityGrants.filter(
                  (grant) =>
                    grant.accountId === account.id &&
                    grant.capability === "read_reports" &&
                    isAdvertisingGrantActive(grant, now),
                );
                const isReady = isReportingReady(account, capabilities, grants, now);
                const reconciliation = latestReconciliations.get(account.id);
                return (
                  <tr key={account.id} className="border-border border-b last:border-b-0">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={grants.length > 0}
                          disabled
                          aria-label={t("advertising.accountSelection", {
                            account: account.name,
                          })}
                        />
                        <ChevronRight
                          className="text-fg-muted h-4 w-4 shrink-0 rtl:rotate-180"
                          aria-hidden="true"
                        />
                        <div className="bg-primary-subtle text-primary text-label flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold">
                          {account.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-body text-fg-primary truncate font-semibold">
                            {account.name}
                          </p>
                          <p className="text-label text-fg-muted font-mono" dir="ltr">
                            {account.externalAccountId}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusBadge
                        variant={account.status === "active" ? "success" : "warning"}
                        label={
                          account.status === "active"
                            ? t("advertising.accountActive")
                            : t("advertising.accountNeedsAttention")
                        }
                      />
                    </td>
                    <td className="px-3 py-3.5">
                      <p className="text-label text-fg-primary">
                        {grants.length > 0
                          ? t("advertising.scopeAgency")
                          : t("advertising.notGranted")}
                      </p>
                      {linked ? (
                        <p className="text-label text-fg-muted">
                          {linked.status === "active"
                            ? t("advertising.connected")
                            : t("advertising.notConnected")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusBadge
                        variant={isReady ? "success" : "warning"}
                        label={
                          isReady
                            ? t("advertising.reportingReady")
                            : t("advertising.reportingNotReady")
                        }
                      />
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusBadge
                        variant={
                          sync && !["paused", "dead_letter"].includes(sync.status)
                            ? "success"
                            : "outline"
                        }
                        label={
                          sync && !["paused", "dead_letter"].includes(sync.status)
                            ? t("advertising.syncEnabled")
                            : t("advertising.syncDisabled")
                        }
                      />
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusBadge
                        variant={
                          reconciliation?.completeness === "complete"
                            ? "success"
                            : reconciliation?.completeness === "partial"
                              ? "warning"
                              : "outline"
                        }
                        label={
                          reconciliation?.completeness === "complete"
                            ? t("advertising.historyStatus.complete")
                            : reconciliation?.completeness === "partial"
                              ? t("advertising.historyStatus.partial")
                              : reconciliation
                                ? t("advertising.historyStatus.unavailable")
                                : t("advertising.accountCompletenessUnavailable")
                        }
                      />
                    </td>
                    <td className="text-label text-fg-secondary px-3 py-3.5">
                      {sync?.lastCompletedAt
                        ? formatRelativeDate(sync.lastCompletedAt, new Date(now), locale)
                        : t("advertising.syncDisabled")}
                    </td>
                    <td className="px-5 py-3.5 text-end">
                      <a
                        href="#advertising-grants-card"
                        className="border-border text-label text-fg-primary focus-visible:ring-focus-ring inline-flex min-h-9 items-center rounded-[var(--radius-control)] border px-3 font-semibold focus:outline-none focus-visible:ring-2"
                      >
                        {t("advertising.manageAccess")}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function isReportingReady(
  account: AdvertisingAccount,
  capabilities: readonly Capability[],
  visibilityGrants: readonly VisibilityGrant[],
  now: number,
) {
  return (
    account.status === "active" &&
    capabilities.some(
      (capability) =>
        capability.accountId === account.id &&
        capability.capability === "read_reports" &&
        capability.status === "available",
    ) &&
    visibilityGrants.some(
      (grant) =>
        grant.accountId === account.id &&
        grant.capability === "read_reports" &&
        isAdvertisingGrantActive(grant, now),
    )
  );
}

function StatusBadge({
  variant,
  label,
}: {
  variant: "success" | "warning" | "danger" | "outline";
  label: string;
}) {
  const Icon =
    variant === "success" ? CheckCircle2 : variant === "danger" ? XCircle : AlertTriangle;
  return (
    <Badge variant={variant}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}

const grantCapabilities = [
  "read_reports",
  "read_campaigns",
  "read_adsets",
  "read_ads",
  "read_creatives",
  "export_reports",
  "use_ai_context",
] as const;

function GrantAccessCard({
  accounts,
  workspaces,
  visibilityGrants,
  financialAuthorities,
}: {
  accounts: readonly AdvertisingAccount[];
  workspaces: readonly Workspace[];
  visibilityGrants: readonly VisibilityGrant[];
  financialAuthorities: readonly FinancialAuthority[];
}) {
  const t = useLocaleT();
  const [grantState, grantAction] = useActionState(grantAdvertisingVisibilityAction, initial);
  const [financialState, financialAction] = useActionState(
    grantAdvertisingFinancialAuthorityAction,
    initial,
  );
  const [revokeGrantState, revokeGrantAction] = useActionState(
    revokeAdvertisingVisibilityAction,
    initial,
  );
  const [revokeAuthorityState, revokeAuthorityAction] = useActionState(
    revokeAdvertisingFinancialAuthorityAction,
    initial,
  );
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [workspaceId, setWorkspaceId] = React.useState("");
  const [capability, setCapability] =
    React.useState<(typeof grantCapabilities)[number]>("read_reports");
  const [financialAccountId, setFinancialAccountId] = React.useState(accounts[0]?.id ?? "");
  const [financialWorkspaceId, setFinancialWorkspaceId] = React.useState("");
  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: t("advertising.accountOption", {
      name: account.name,
      externalId: account.externalAccountId,
    }),
  }));
  const workspaceOptions = [
    { value: "", label: t("advertising.scopeAgency") },
    ...workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name })),
  ];

  return (
    <Card id="advertising-grants-card" data-testid="advertising-grants-card">
      <div className="flex items-start gap-3">
        <div className="bg-primary-subtle text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <CardTitle>{t("advertising.permissionsTitle")}</CardTitle>
          <CardDescription>{t("advertising.permissionsDescription")}</CardDescription>
        </div>
      </div>
      {accounts.length === 0 ? (
        <p className="text-body text-fg-secondary mt-4">{t("advertising.noAccounts")}</p>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <form
            action={grantAction}
            className="border-border bg-surface-subtle/45 grid gap-4 rounded-[var(--radius-card)] border p-4 lg:col-span-2 lg:grid-cols-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="advertising-grant-account">{t("advertising.accountsTitle")}</Label>
              <Combobox
                id="advertising-grant-account"
                name="accountId"
                value={accountId}
                onChange={setAccountId}
                options={accountOptions}
                placeholder={t("advertising.displayName")}
                ariaLabel={t("advertising.accountsTitle")}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="advertising-grant-workspace">{t("advertising.scopeWorkspace")}</Label>
              <Combobox
                id="advertising-grant-workspace"
                name="workspaceId"
                value={workspaceId}
                onChange={setWorkspaceId}
                options={workspaceOptions}
                placeholder={t("advertising.scopeAgency")}
                ariaLabel={t("advertising.scopeWorkspace")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="advertising-grant-capability">{t("advertising.capability")}</Label>
              <Combobox
                id="advertising-grant-capability"
                name="capability"
                value={capability}
                onChange={(next) => {
                  if (grantCapabilities.includes(next as (typeof grantCapabilities)[number]))
                    setCapability(next as (typeof grantCapabilities)[number]);
                }}
                options={grantCapabilities.map((value) => ({
                  value,
                  label: t(`advertising.capabilityLabels.${value}`),
                }))}
                ariaLabel={t("advertising.capability")}
                allowCustom={false}
                required
              />
            </div>
            <div className="flex items-end">
              <FormSubmitButton
                label={t("advertising.grantVisibility")}
                pendingLabel={t("advertising.grantingVisibility")}
                size="sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="advertising-grant-campaigns">{t("advertising.scopeCampaigns")}</Label>
              <Input
                id="advertising-grant-campaigns"
                name="campaignIds"
                placeholder="campaign_1, campaign_2"
              />
              <p className="text-label text-fg-muted">{t("advertising.scopeIdsHelp")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="advertising-grant-adsets">{t("advertising.scopeAdSets")}</Label>
              <Input id="advertising-grant-adsets" name="adSetIds" placeholder="adset_1, adset_2" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="advertising-grant-ads">{t("advertising.scopeAds")}</Label>
              <Input id="advertising-grant-ads" name="adIds" placeholder="ad_1, ad_2" />
            </div>
            {grantState.code ? <ActionMessage state={grantState} compact /> : null}
          </form>
          <form
            action={financialAction}
            className="border-border bg-surface-subtle/45 space-y-3 rounded-[var(--radius-card)] border p-4"
          >
            <div>
              <h3 className="text-body text-fg-primary font-semibold">
                {t("advertising.grantFinancial")}
              </h3>
              <p className="text-label text-fg-muted">{t("advertising.financialDescription")}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Combobox
                name="accountId"
                value={financialAccountId}
                onChange={setFinancialAccountId}
                options={accountOptions}
                placeholder={t("advertising.displayName")}
                ariaLabel={t("advertising.accountsTitle")}
                required
              />
              <Combobox
                name="workspaceId"
                value={financialWorkspaceId}
                onChange={setFinancialWorkspaceId}
                options={workspaceOptions}
                placeholder={t("advertising.scopeAgency")}
                ariaLabel={t("advertising.scopeWorkspace")}
              />
              <FormSubmitButton
                label={t("advertising.grantFinancial")}
                pendingLabel={t("advertising.grantingFinancial")}
                size="sm"
              />
            </div>
            {financialState.code ? <ActionMessage state={financialState} compact /> : null}
          </form>
          <div className="border-border space-y-3 rounded-[var(--radius-control)] border p-4">
            <h3 className="text-body text-fg-primary font-semibold">
              {t("advertising.activeGrantsTitle")}
            </h3>
            {visibilityGrants.length === 0 ? (
              <p className="text-label text-fg-secondary">{t("advertising.noActiveGrants")}</p>
            ) : (
              <ul className="space-y-2">
                {visibilityGrants.map((grant) => (
                  <li
                    key={grant.id}
                    className="border-border flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border p-3"
                  >
                    <div>
                      <p className="text-body text-fg-primary font-medium">
                        {grant.accountName} ·{" "}
                        {t(`advertising.capabilityLabels.${grant.capability}`)}
                      </p>
                      <p className="text-label text-fg-muted">
                        {grant.workspaceName ?? t("advertising.scopeAgency")}
                        {grant.campaignIds?.length
                          ? ` · ${t("advertising.campaignScopeCount", { count: grant.campaignIds.length })}`
                          : ""}
                        {grant.revokedAt ? ` · ${t("advertising.revoked")}` : ""}
                      </p>
                    </div>
                    {!grant.revokedAt ? (
                      <form action={revokeGrantAction}>
                        <input type="hidden" name="grantId" value={grant.id} />
                        <Button type="submit" size="sm" variant="outline">
                          {t("advertising.revokeGrant")}
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {revokeGrantState.code ? <ActionMessage state={revokeGrantState} compact /> : null}
          </div>
          <div className="border-border space-y-3 rounded-[var(--radius-control)] border p-4">
            <h3 className="text-body text-fg-primary font-semibold">
              {t("advertising.financialAuthoritiesTitle")}
            </h3>
            {financialAuthorities.length === 0 ? (
              <p className="text-label text-fg-secondary">
                {t("advertising.noFinancialAuthorities")}
              </p>
            ) : (
              <ul className="space-y-2">
                {financialAuthorities.map((authority) => (
                  <li
                    key={authority.id}
                    className="border-border flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border p-3"
                  >
                    <div>
                      <p className="text-body text-fg-primary font-medium">
                        {authority.accountName}
                      </p>
                      <p className="text-label text-fg-muted">
                        {authority.workspaceName ?? t("advertising.scopeAgency")}
                        {authority.revokedAt ? ` · ${t("advertising.revoked")}` : ""}
                      </p>
                    </div>
                    {!authority.revokedAt ? (
                      <form action={revokeAuthorityAction}>
                        <input type="hidden" name="authorityId" value={authority.id} />
                        <Button type="submit" size="sm" variant="outline">
                          {t("advertising.revokeFinancial")}
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {revokeAuthorityState.code ? (
              <ActionMessage state={revokeAuthorityState} compact />
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}

function AdvertisingHistoryCard({
  validationResults,
  syncRuns,
  connections,
  reconciliations,
}: {
  validationResults: readonly ValidationResult[];
  syncRuns: readonly SyncRun[];
  connections: readonly Connection[];
  reconciliations: readonly Reconciliation[];
}) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const connectionName = new Map(
    connections.map((connection) => [connection.id, connection.displayName]),
  );
  const validationPreview = validationResults.slice(0, 6);
  const validationOverflow = validationResults.slice(6);
  const syncPreview = syncRuns.slice(0, 6);
  const syncOverflow = syncRuns.slice(6);
  const reconciliationPreview = reconciliations.slice(0, 8);
  const reconciliationOverflow = reconciliations.slice(8);
  return (
    <Card
      id="advertising-history-card"
      data-testid="advertising-history-card"
      className="overflow-hidden"
    >
      <div className="border-border bg-surface-subtle/55 -mx-4 -mt-4 mb-5 flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:-mx-5 sm:-mt-5 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="bg-primary-subtle text-primary flex h-10 w-10 items-center justify-center rounded-xl">
            <History className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <CardTitle>{t("advertising.historyTitle")}</CardTitle>
            <CardDescription>{t("advertising.historyDescription")}</CardDescription>
          </div>
        </div>
        <Badge variant="outline">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          {t("advertising.readOnlyBadge")}
        </Badge>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <HistoryListSection
          id="advertising-validation-history"
          title={t("advertising.validationHistoryTitle")}
          count={validationResults.length}
          rows={validationResults}
          previewRows={validationPreview}
          overflowRows={validationOverflow}
          renderRows={(rows) =>
            rows.map((result) => (
              <li
                key={result.id}
                className="border-border flex gap-3 border-b py-3 last:border-b-0"
              >
                <HistoryStatusIcon status={result.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <span className="text-body text-fg-primary min-w-0 font-medium">
                      {t(`advertising.diagnosticOperations.${result.operation}`)}
                    </span>
                    <HistoryStatusBadge status={result.status} t={t} />
                  </div>
                  <p className="text-label text-fg-muted overflow-wrap-anywhere mt-1">
                    {connectionName.get(result.connectionId) ?? result.connectionId}
                    <span aria-hidden="true"> · </span>
                    <bdi dir="ltr">{result.sanitizedCode ?? "—"}</bdi>
                    <span aria-hidden="true"> · </span>
                    {formatDate(result.checkedAt, locale, DateFormat.dateTime)}
                  </p>
                </div>
              </li>
            ))
          }
          t={t}
        />
        <HistoryListSection
          id="advertising-sync-history"
          title={t("advertising.syncHistoryTitle")}
          count={syncRuns.length}
          rows={syncRuns}
          previewRows={syncPreview}
          overflowRows={syncOverflow}
          renderRows={(rows) =>
            rows.map((run) => (
              <li key={run.id} className="border-border flex gap-3 border-b py-3 last:border-b-0">
                <HistoryStatusIcon status={run.status} partial={run.partial} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <span className="text-body text-fg-primary min-w-0 font-medium">
                      {run.accountName}
                    </span>
                    <HistoryStatusBadge status={run.status} partial={run.partial} t={t} />
                  </div>
                  <p className="text-label text-fg-muted mt-1">
                    {t("advertising.rowsSummary", { read: run.rowsRead, written: run.rowsWritten })}
                    {run.errorCode ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        <bdi dir="ltr">{run.errorCode}</bdi>
                      </>
                    ) : null}
                  </p>
                  {run.partial ? (
                    <p className="text-label text-warning mt-2 flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{t("advertising.partialSyncHint")}</span>
                    </p>
                  ) : null}
                </div>
              </li>
            ))
          }
          t={t}
        />
        <section
          aria-labelledby="advertising-reconciliation-history"
          className="border-border bg-surface-subtle/35 rounded-[var(--radius-card)] border p-4 xl:col-span-2"
        >
          <h3
            id="advertising-reconciliation-history"
            className="text-body text-fg-primary flex items-center gap-2 font-semibold"
          >
            <CircleDollarSign className="text-primary h-4 w-4" aria-hidden="true" />
            {t("advertising.reconciliationTitle")}
            <span className="bg-surface text-fg-muted rounded-full px-2 py-0.5 text-xs font-medium">
              {t("advertising.historyCount", { count: reconciliations.length })}
            </span>
          </h3>
          <p className="text-label text-fg-muted mt-1 max-w-3xl">
            {t("advertising.reconciliationDescription")}
          </p>
          <p className="text-label text-fg-muted mt-2 max-w-3xl xl:text-end">
            {t("advertising.zeroValueNote")}
          </p>
          {reconciliations.length === 0 ? (
            <p className="text-label text-fg-secondary mt-2">{t("advertising.noHistory")}</p>
          ) : (
            <>
              <div className="border-border mt-4 overflow-x-auto rounded-[var(--radius-control)] border">
                <table
                  className="w-full min-w-[780px] text-start"
                  data-testid="advertising-reconciliation-table"
                >
                  <thead className="bg-surface border-border border-b">
                    <tr>
                      <th className="text-label text-fg-muted px-4 py-3 font-semibold" scope="col">
                        {t("advertising.reconciliationAccount")}
                      </th>
                      <th className="text-label text-fg-muted px-3 py-3 font-semibold" scope="col">
                        {t("advertising.reconciliationDate")}
                      </th>
                      <th
                        className="text-label text-fg-muted px-3 py-3 text-end font-semibold"
                        scope="col"
                      >
                        {t("advertising.providerSpend")}
                      </th>
                      <th
                        className="text-label text-fg-muted px-3 py-3 text-end font-semibold"
                        scope="col"
                      >
                        {t("advertising.unallocatedSpend")}
                      </th>
                      <th
                        className="text-label text-fg-muted px-3 py-3 text-end font-semibold"
                        scope="col"
                      >
                        {t("advertising.discrepancy")}
                      </th>
                      <th className="text-label text-fg-muted px-4 py-3 font-semibold" scope="col">
                        {t("advertising.reconciliationStatus")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciliationPreview.map((row) => (
                      <ReconciliationRow key={row.id} row={row} locale={locale} t={t} />
                    ))}
                  </tbody>
                </table>
              </div>
              {reconciliationOverflow.length > 0 ? (
                <details className="mt-3">
                  <summary className="text-label text-primary focus-ring inline-flex min-h-11 cursor-pointer items-center rounded-[var(--radius-control)] px-2 font-semibold">
                    {t("advertising.historyViewAll", { count: reconciliationOverflow.length })}
                  </summary>
                  <div className="border-border mt-2 overflow-x-auto rounded-[var(--radius-control)] border">
                    <table className="w-full min-w-[780px] text-start">
                      <thead className="bg-surface border-border border-b">
                        <tr>
                          <th
                            className="text-label text-fg-muted px-4 py-3 font-semibold"
                            scope="col"
                          >
                            {t("advertising.reconciliationAccount")}
                          </th>
                          <th
                            className="text-label text-fg-muted px-3 py-3 font-semibold"
                            scope="col"
                          >
                            {t("advertising.reconciliationDate")}
                          </th>
                          <th
                            className="text-label text-fg-muted px-3 py-3 text-end font-semibold"
                            scope="col"
                          >
                            {t("advertising.providerSpend")}
                          </th>
                          <th
                            className="text-label text-fg-muted px-3 py-3 text-end font-semibold"
                            scope="col"
                          >
                            {t("advertising.unallocatedSpend")}
                          </th>
                          <th
                            className="text-label text-fg-muted px-3 py-3 text-end font-semibold"
                            scope="col"
                          >
                            {t("advertising.discrepancy")}
                          </th>
                          <th
                            className="text-label text-fg-muted px-4 py-3 font-semibold"
                            scope="col"
                          >
                            {t("advertising.reconciliationStatus")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {reconciliationOverflow.map((row) => (
                          <ReconciliationRow key={row.id} row={row} locale={locale} t={t} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : null}
            </>
          )}
        </section>
      </div>
    </Card>
  );
}

function HistoryListSection<T extends { id: string }>({
  id,
  title,
  count,
  rows,
  previewRows,
  overflowRows,
  renderRows,
  t,
}: {
  id: string;
  title: string;
  count: number;
  rows: readonly T[];
  previewRows: readonly T[];
  overflowRows: readonly T[];
  renderRows: (rows: readonly T[]) => React.ReactNode;
  t: ReturnType<typeof useLocaleT>;
}) {
  return (
    <section aria-labelledby={id} className="border-border rounded-[var(--radius-card)] border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 id={id} className="text-body text-fg-primary font-semibold">
          {title}
        </h3>
        <span className="bg-surface-subtle text-fg-muted rounded-full px-2 py-0.5 text-xs font-medium">
          {t("advertising.historyCount", { count })}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-label text-fg-secondary mt-3">{t("advertising.noHistory")}</p>
      ) : (
        <>
          <ul className="mt-2">{renderRows(previewRows)}</ul>
          {overflowRows.length > 0 ? (
            <details className="mt-2">
              <summary className="text-label text-primary focus-ring inline-flex min-h-11 cursor-pointer items-center rounded-[var(--radius-control)] px-2 font-semibold">
                {t("advertising.historyViewAll", { count: overflowRows.length })}
              </summary>
              <ul className="border-border mt-2 border-t">{renderRows(overflowRows)}</ul>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

function HistoryStatusIcon({ status, partial = false }: { status: string; partial?: boolean }) {
  if (status === "passed" || status === "succeeded") {
    return <CheckCircle2 className="text-success mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />;
  }
  if (partial || status === "partial") {
    return <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />;
  }
  return <XCircle className="text-danger mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />;
}

function HistoryStatusBadge({
  status,
  partial = false,
  t,
}: {
  status: string;
  partial?: boolean;
  t: ReturnType<typeof useLocaleT>;
}) {
  return (
    <Badge
      variant={
        status === "passed" || status === "succeeded"
          ? "success"
          : partial || status === "partial"
            ? "warning"
            : "danger"
      }
    >
      {t(`advertising.historyStatus.${status}`)}
    </Badge>
  );
}

function ReconciliationRow({
  row,
  locale,
  t,
}: {
  row: Reconciliation;
  locale: ReturnType<typeof useLocaleCode>;
  t: ReturnType<typeof useLocaleT>;
}) {
  const discrepancyIsZero = parseAmount(row.discrepancy) === 0;
  return (
    <tr className="border-border border-b last:border-b-0">
      <td className="px-4 py-3 align-top">
        <div className="min-w-0">
          <p className="text-body text-fg-primary overflow-wrap-anywhere max-w-[18rem] font-medium">
            {row.accountName}
          </p>
          <p className="text-label text-fg-muted mt-0.5 font-mono" dir="ltr">
            {row.accountId}
          </p>
        </div>
      </td>
      <td className="text-label text-fg-secondary px-3 py-3 align-top whitespace-nowrap">
        <bdi dir="ltr">{row.reportDate}</bdi>
      </td>
      <td
        className="text-body text-fg-primary px-3 py-3 text-end align-top font-medium whitespace-nowrap tabular-nums"
        dir="ltr"
      >
        {formatSpend(row.providerAccountSpend, row.currency, locale)}
      </td>
      <td
        className="text-body px-3 py-3 text-end align-top whitespace-nowrap tabular-nums"
        dir="ltr"
      >
        <ZeroAwareSpend value={row.unallocatedSpend} currency={row.currency} locale={locale} />
      </td>
      <td
        className="text-body px-3 py-3 text-end align-top whitespace-nowrap tabular-nums"
        dir="ltr"
      >
        <ZeroAwareSpend value={row.discrepancy} currency={row.currency} locale={locale} />
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex flex-col items-start gap-1.5">
          <Badge variant={row.completeness === "complete" ? "success" : "warning"}>
            {row.completeness === "complete" && discrepancyIsZero ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {t(`advertising.historyStatus.${row.completeness}`)}
          </Badge>
          {row.completeness === "partial" ? (
            <p className="text-label text-warning max-w-64">
              {t("advertising.partialReconciliationHint")}
            </p>
          ) : null}
          {discrepancyIsZero ? (
            <span className="text-label text-success">{t("advertising.reconciled")}</span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function parseAmount(value: string): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function formatSpend(value: string, currency: string, locale: ReturnType<typeof useLocaleCode>) {
  const amount = parseAmount(value);
  if (amount === null) return "—";
  return formatCurrency(amount, currency, locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function ZeroAwareSpend({
  value,
  currency,
  locale,
}: {
  value: string;
  currency: string;
  locale: ReturnType<typeof useLocaleCode>;
}) {
  const formatted = formatSpend(value, currency, locale);
  if (parseAmount(value) !== 0) {
    return <span className="text-fg-primary">{formatted}</span>;
  }
  return (
    <span className="text-fg-muted" title={formatted} aria-label={formatted}>
      —
    </span>
  );
}

function ConnectionCard({
  connection,
  syncStates,
  connectionAccounts,
  socialIdentities,
  capabilities,
}: {
  connection: Connection;
  syncStates: readonly SyncState[];
  connectionAccounts: readonly ConnectionAccount[];
  socialIdentities: readonly SocialIdentity[];
  capabilities: readonly Capability[];
}) {
  const t = useLocaleT();
  const [credentialState, credentialAction] = useActionState(
    storeAdvertisingCredentialAction,
    initial,
  );
  const [versionState, versionAction] = useActionState(
    updateAdvertisingGraphApiVersionAction,
    initial,
  );
  const [revokeState, revokeAction] = useActionState(revokeAdvertisingConnectionAction, initial);
  const [syncState, syncAction] = useActionState(setAdvertisingSyncStateAction, initial);
  const [revokeAccountState, revokeAccountAction] = useActionState(
    revokeAdvertisingAccountAccessAction,
    initial,
  );
  const [validationState, setValidationState] = React.useState<AdvertisingActionState>({});
  const [validating, setValidating] = React.useState(false);
  const [revealed, setRevealed] = React.useState(false);
  const status =
    connection.status === "active"
      ? "success"
      : connection.status === "revoked"
        ? "danger"
        : "outline";

  const validate = async () => {
    setValidating(true);
    try {
      setValidationState(await validateAdvertisingConnectionAction(connection.id));
    } finally {
      setValidating(false);
    }
  };

  return (
    <Card
      id={`advertising-connection-${connection.id}`}
      data-testid={`advertising-connection-${connection.id}`}
      className="scroll-mt-6 overflow-hidden"
    >
      <div className="border-border bg-surface-subtle/55 -mx-4 -mt-4 mb-5 flex flex-wrap items-start justify-between gap-4 border-b px-4 py-4 sm:-mx-5 sm:-mt-5 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="bg-primary-subtle text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
            <Link2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-label text-primary font-semibold tracking-[0.12em] uppercase">
              {t("advertising.connectionSectionTitle")}
            </p>
            <CardTitle className="mt-1">{connection.displayName}</CardTitle>
            <CardDescription>
              {t("advertising.connectionSectionDescription")} · {connection.provider} ·{" "}
              <bdi dir="ltr">{connection.graphApiVersion ?? META_DEFAULT_GRAPH_VERSION}</bdi>
            </CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status}>
            {connection.status === "active" ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {t(`advertising.status.${connection.status}`)}
          </Badge>
          {connection.lastValidatedAt ? (
            <span className="text-label text-fg-muted inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {t("advertising.lastUpdated", {
                date: new Date(connection.lastValidatedAt).toLocaleString(),
              })}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <form
          action={credentialAction}
          className="border-border bg-surface-subtle/55 space-y-3 rounded-[var(--radius-card)] border p-4"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="text-fg-muted h-4 w-4" aria-hidden="true" />
            <h3 className="text-body text-fg-primary font-semibold">
              {t("advertising.credentialTitle")}
            </h3>
          </div>
          <p className="text-label text-fg-muted">{t("advertising.credentialDescription")}</p>
          <div
            className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3"
            data-testid={`advertising-credential-status-${connection.id}`}
          >
            <div className="flex items-center gap-2">
              {connection.currentCredentialVersion > 0 ? (
                <ShieldCheck className="text-success h-4 w-4" aria-hidden="true" />
              ) : (
                <ShieldAlert className="text-fg-muted h-4 w-4" aria-hidden="true" />
              )}
              <div>
                <p className="text-label text-fg-primary font-semibold">
                  {connection.currentCredentialVersion > 0
                    ? t("advertising.credentialConfigured")
                    : t("advertising.credentialNotConfigured")}
                </p>
                <p className="text-label text-fg-muted">
                  {connection.currentCredentialVersion > 0
                    ? t("advertising.credentialVersion", {
                        count: connection.currentCredentialVersion,
                      })
                    : t("advertising.credentialNotConfiguredDescription")}
                </p>
              </div>
            </div>
            {connection.currentCredentialVersion > 0 ? (
              <code
                className="bg-surface-subtle text-body text-fg-primary rounded-[var(--radius-control)] px-2.5 py-1 font-mono"
                aria-label={t("advertising.credentialHintAria")}
              >
                ••••{connection.accessTokenLast4 ?? "••••"}
              </code>
            ) : null}
          </div>
          <input type="hidden" name="connectionId" value={connection.id} />
          <Label htmlFor={`advertising-token-${connection.id}`}>
            {t("advertising.accessToken")}
          </Label>
          <PasswordInput
            id={`advertising-token-${connection.id}`}
            name="accessToken"
            autoComplete="new-password"
            placeholder={
              connection.currentCredentialVersion > 0
                ? t("advertising.replaceCredentialPlaceholder")
                : t("advertising.enterCredentialPlaceholder")
            }
            required
            revealed={revealed}
            onToggleRevealed={() => setRevealed((value) => !value)}
          />
          <FormSubmitButton
            label={t("advertising.saveCredential")}
            pendingLabel={t("advertising.savingCredential")}
            size="sm"
          />
          {credentialState.code ? <ActionMessage state={credentialState} compact /> : null}
        </form>

        <div className="border-border bg-surface-subtle/55 space-y-3 rounded-[var(--radius-card)] border p-4">
          <h3 className="text-body text-fg-primary font-semibold">
            {t("advertising.validationTitle")}
          </h3>
          <p className="text-label text-fg-muted">{t("advertising.validationDescription")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={validate}
              disabled={
                validating ||
                connection.currentCredentialVersion < 1 ||
                connection.status === "revoked"
              }
            >
              {validating ? t("advertising.validating") : t("advertising.validate")}
            </Button>
            <form action={revokeAction}>
              <input type="hidden" name="connectionId" value={connection.id} />
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={connection.status === "revoked"}
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                {t("advertising.revoke")}
              </Button>
            </form>
          </div>
          {validationState.code ? <ActionMessage state={validationState} compact /> : null}
          {revokeState.code ? <ActionMessage state={revokeState} compact /> : null}
          {connection.lastValidationCode ? (
            <p className="text-label text-fg-muted">
              {t("advertising.lastResult", { code: connection.lastValidationCode })}
            </p>
          ) : null}
          {validationState.diagnostics?.length ? (
            <DiagnosticSummary
              diagnostics={validationState.diagnostics}
              connectionId={connection.id}
            />
          ) : null}
        </div>
      </div>
      <form
        action={versionAction}
        className="border-border bg-surface-subtle/55 mt-4 space-y-3 rounded-[var(--radius-card)] border p-4"
      >
        <div>
          <h3 className="text-body text-fg-primary font-semibold">
            {t("advertising.graphVersionTitle")}
          </h3>
          <p className="text-label text-fg-muted">{t("advertising.graphVersionDescription")}</p>
        </div>
        <input type="hidden" name="connectionId" value={connection.id} />
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 space-y-1.5">
            <Label htmlFor={`advertising-graph-version-${connection.id}`}>
              {t("advertising.graphVersion")}
            </Label>
            <Input
              id={`advertising-graph-version-${connection.id}`}
              name="graphApiVersion"
              defaultValue={connection.graphApiVersion ?? META_DEFAULT_GRAPH_VERSION}
              pattern="v\d+\.\d+"
              maxLength={20}
              required
            />
          </div>
          <FormSubmitButton
            label={t("advertising.updateGraphVersion")}
            pendingLabel={t("advertising.updatingGraphVersion")}
            size="sm"
          />
        </div>
        {versionState.code ? <ActionMessage state={versionState} compact /> : null}
      </form>
      <div
        className="border-border bg-surface-subtle/55 mt-4 space-y-3 rounded-[var(--radius-card)] border p-4"
        data-testid={`advertising-capabilities-${connection.id}`}
      >
        <div>
          <h3 className="text-body text-fg-primary font-semibold">
            {t("advertising.capabilitiesTitle")}
          </h3>
          <p className="text-label text-fg-muted">{t("advertising.capabilitiesDescription")}</p>
        </div>
        {capabilities.length === 0 ? (
          <p className="text-label text-fg-secondary">{t("advertising.noCapabilities")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {capabilities.map((capability) => (
              <li
                key={capability.id}
                className="border-border bg-surface flex items-start gap-2 rounded-[var(--radius-control)] border p-3"
              >
                <span
                  className={
                    capability.status === "available"
                      ? "bg-success text-primary-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      : "bg-surface-subtle text-fg-muted flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  }
                >
                  {capability.status === "available" ? (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="text-label text-fg-primary block font-semibold">
                    {t(`advertising.capabilityLabels.${capability.capability}`)}
                  </span>
                  <span className="text-label text-fg-muted block">
                    {t(`advertising.capabilityStatus.${capability.status}`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        className="border-border bg-surface-subtle/55 mt-4 space-y-3 rounded-[var(--radius-card)] border p-4"
        data-testid={`advertising-identities-${connection.id}`}
      >
        <div>
          <h3 className="text-body text-fg-primary font-semibold">
            {t("advertising.socialIdentitiesTitle")}
          </h3>
          <p className="text-label text-fg-muted">{t("advertising.socialIdentitiesDescription")}</p>
        </div>
        {socialIdentities.length === 0 ? (
          <p className="text-label text-fg-secondary">{t("advertising.noSocialIdentities")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {socialIdentities.map((identity) => (
              <li
                key={identity.id}
                className="border-border bg-surface flex items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="bg-info-subtle text-info flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                    <UsersRound className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-body text-fg-primary truncate font-medium">
                      {identity.displayName ?? identity.username ?? identity.externalIdentityId}
                    </p>
                    <p className="text-label text-fg-muted">
                      {t(`advertising.socialIdentityType.${identity.identityType}`)}
                      {identity.username ? (
                        <>
                          {" · "}
                          <bdi dir="ltr">@{identity.username}</bdi>
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
                <bdi className="text-label text-fg-muted" dir="ltr">
                  {identity.externalIdentityId}
                </bdi>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        className="border-border bg-surface-subtle mt-4 space-y-3 rounded-[var(--radius-control)] border p-4"
        data-testid={`advertising-sync-${connection.id}`}
      >
        <div>
          <h3 className="text-body text-fg-primary font-semibold">{t("advertising.syncTitle")}</h3>
          <p className="text-label text-fg-muted">{t("advertising.syncDescription")}</p>
        </div>
        {connectionAccounts.length === 0 ? (
          <p className="text-label text-fg-secondary">{t("advertising.noLinkedAccounts")}</p>
        ) : (
          <div className="space-y-2">
            {connectionAccounts.map((link) => {
              const state = syncStates.find((candidate) => candidate.accountId === link.accountId);
              const paused =
                state?.status === "paused" || state?.status === "dead_letter" || !state;
              return (
                <div
                  key={link.accountId}
                  className="border-border flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3"
                >
                  <div>
                    <p className="text-body text-fg-primary font-medium">
                      {t("advertising.accountOption", {
                        name: link.accountName,
                        externalId: link.externalAccountId,
                      })}
                    </p>
                    <p className="text-label text-fg-muted">
                      {t(`advertising.syncStatus.${state?.status ?? "paused"}`)}
                    </p>
                  </div>
                  <form action={syncAction}>
                    <input type="hidden" name="connectionId" value={connection.id} />
                    <input type="hidden" name="accountId" value={link.accountId} />
                    <input type="hidden" name="enabled" value={paused ? "true" : "false"} />
                    <Button
                      type="submit"
                      size="sm"
                      variant={paused ? "secondary" : "outline"}
                      disabled={link.status !== "active" || connection.status !== "active"}
                    >
                      {paused ? (
                        <Play className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Pause className="h-4 w-4" aria-hidden="true" />
                      )}
                      {paused ? t("advertising.activateSync") : t("advertising.disableSync")}
                    </Button>
                  </form>
                  <form action={revokeAccountAction}>
                    <input type="hidden" name="connectionId" value={connection.id} />
                    <input type="hidden" name="accountId" value={link.accountId} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="destructive"
                      disabled={link.status !== "active"}
                    >
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                      {t("advertising.revokeAccountAccess")}
                    </Button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
        {syncState.code ? <ActionMessage state={syncState} compact /> : null}
        {revokeAccountState.code ? <ActionMessage state={revokeAccountState} compact /> : null}
      </div>
    </Card>
  );
}

function DiagnosticSummary({
  diagnostics,
  connectionId,
}: {
  diagnostics: readonly { operation: string; state: string; retryable: boolean }[];
  connectionId: string;
}) {
  const t = useLocaleT();
  const passed = diagnostics.filter((diagnostic) => diagnostic.state === "valid").length;
  const attention = diagnostics.length - passed;
  const summaryStatus = attention === 0 ? "success" : "warning";
  return (
    <div
      className="space-y-3"
      data-testid={`advertising-diagnostic-summary-${connectionId}`}
      aria-live="polite"
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="border-border bg-surface rounded-[var(--radius-control)] border p-3">
          <p className="text-label text-fg-muted">{t("advertising.diagnosticCheckCount")}</p>
          <p className="text-title-card text-fg-primary font-semibold tabular-nums">
            {diagnostics.length}
          </p>
        </div>
        <div className="border-border bg-surface rounded-[var(--radius-control)] border p-3">
          <p className="text-label text-fg-muted">{t("advertising.diagnosticPassedCount")}</p>
          <p className="text-title-card text-success font-semibold tabular-nums">{passed}</p>
        </div>
        <div className="border-border bg-surface rounded-[var(--radius-control)] border p-3">
          <p className="text-label text-fg-muted">{t("advertising.diagnosticAttentionCount")}</p>
          <p className="text-title-card text-warning font-semibold tabular-nums">{attention}</p>
        </div>
      </div>
      <Badge variant={summaryStatus}>
        {attention === 0
          ? t("advertising.diagnosticSummaryPassed")
          : t("advertising.diagnosticSummaryAttention")}
      </Badge>
      <div className="space-y-2">
        {diagnostics.map((diagnostic) => {
          const fixKey =
            diagnostic.operation === "instagram_read" && diagnostic.state === "no_data"
              ? "instagram_no_data"
              : diagnostic.state;
          return (
            <div
              key={`${diagnostic.operation}-${diagnostic.state}`}
              className="border-border bg-surface-subtle space-y-1 rounded-[var(--radius-control)] border p-3"
              data-testid={`advertising-diagnostic-${diagnostic.operation}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-label text-fg-primary font-semibold">
                  {t(`advertising.diagnosticOperations.${diagnostic.operation}`)}
                </p>
                <Badge variant={diagnostic.state === "valid" ? "success" : "warning"}>
                  {t(`advertising.diagnosticStates.${diagnostic.state}`)}
                </Badge>
              </div>
              <p className="text-label text-fg-secondary">
                {t(`advertising.diagnostics.${diagnostic.state}`)}
              </p>
              {diagnostic.state !== "valid" ? (
                <p className="text-label text-fg-muted" data-testid="advertising-diagnostic-fix">
                  <span className="font-semibold">{t("advertising.diagnosticToFix")}</span>{" "}
                  {t(`advertising.diagnosticFixes.${fixKey}`)}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActionMessage({
  state,
  compact = false,
}: {
  state: AdvertisingActionState;
  compact?: boolean;
}) {
  const t = useLocaleT();
  const message = stateText(t, state) ?? t("advertising.codes.advertising_action_failed");
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`text-label mt-3 font-semibold ${state.ok ? "text-success" : "text-danger"} ${compact ? "" : "sm:col-span-2"}`}
    >
      {message}
    </p>
  );
}
