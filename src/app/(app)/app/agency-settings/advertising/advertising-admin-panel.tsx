"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  History,
  KeyRound,
  Pause,
  Play,
  Plus,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { PasswordInput } from "@/components/forms/password-input";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { META_DEFAULT_GRAPH_VERSION } from "@/lib/meta/version";
import {
  createAdvertisingConnectionAction,
  grantAdvertisingFinancialAuthorityAction,
  grantAdvertisingVisibilityAction,
  revokeAdvertisingConnectionAction,
  revokeAdvertisingAccountAccessAction,
  revokeAdvertisingFinancialAuthorityAction,
  revokeAdvertisingVisibilityAction,
  storeAdvertisingCredentialAction,
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
}) {
  const t = useLocaleT();
  const [createState, createAction] = useActionState(createAdvertisingConnectionAction, initial);
  return (
    <div className="space-y-4">
      <Card data-testid="advertising-create-card">
        <div className="flex items-start gap-3">
          <Plus className="text-primary mt-0.5 h-5 w-5" aria-hidden="true" />
          <div>
            <CardTitle>{t("advertising.createTitle")}</CardTitle>
            <CardDescription>{t("advertising.createDescription")}</CardDescription>
          </div>
        </div>
        <form
          action={createAction}
          className="mt-5 grid gap-4 sm:grid-cols-2"
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
          <div className="flex items-end justify-end sm:col-span-2">
            <FormSubmitButton
              label={t("advertising.create")}
              pendingLabel={t("advertising.creating")}
            />
          </div>
        </form>
        {createState.code ? <ActionMessage state={createState} /> : null}
      </Card>

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
    <Card data-testid="advertising-grants-card">
      <CardTitle>{t("advertising.accountsTitle")}</CardTitle>
      <CardDescription>{t("advertising.accountsDescription")}</CardDescription>
      {accounts.length === 0 ? (
        <p className="text-body text-fg-secondary mt-4">{t("advertising.noAccounts")}</p>
      ) : (
        <div className="mt-5 space-y-5">
          <form action={grantAction} className="grid gap-4 lg:grid-cols-4">
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
            className="border-border space-y-3 rounded-[var(--radius-control)] border p-4"
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
  const connectionName = new Map(
    connections.map((connection) => [connection.id, connection.displayName]),
  );
  return (
    <Card data-testid="advertising-history-card">
      <div className="flex items-start gap-3">
        <History className="text-primary mt-0.5 h-5 w-5" aria-hidden="true" />
        <div>
          <CardTitle>{t("advertising.historyTitle")}</CardTitle>
          <CardDescription>{t("advertising.historyDescription")}</CardDescription>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section aria-labelledby="advertising-validation-history">
          <h3
            id="advertising-validation-history"
            className="text-body text-fg-primary font-semibold"
          >
            {t("advertising.validationHistoryTitle")}
          </h3>
          {validationResults.length === 0 ? (
            <p className="text-label text-fg-secondary mt-2">{t("advertising.noHistory")}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {validationResults.slice(0, 20).map((result) => (
                <li
                  key={result.id}
                  className="border-border rounded-[var(--radius-control)] border p-3"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="text-body text-fg-primary font-medium">
                      {t(`advertising.diagnosticOperations.${result.operation}`)}
                    </span>
                    <Badge variant={result.status === "passed" ? "success" : "danger"}>
                      {t(`advertising.historyStatus.${result.status}`)}
                    </Badge>
                  </div>
                  <p className="text-label text-fg-muted mt-1">
                    {connectionName.get(result.connectionId) ?? result.connectionId} ·{" "}
                    {result.sanitizedCode ?? "—"} · {new Date(result.checkedAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="advertising-sync-history">
          <h3 id="advertising-sync-history" className="text-body text-fg-primary font-semibold">
            {t("advertising.syncHistoryTitle")}
          </h3>
          {syncRuns.length === 0 ? (
            <p className="text-label text-fg-secondary mt-2">{t("advertising.noHistory")}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {syncRuns.slice(0, 20).map((run) => (
                <li
                  key={run.id}
                  className="border-border rounded-[var(--radius-control)] border p-3"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="text-body text-fg-primary font-medium">{run.accountName}</span>
                    <Badge
                      variant={
                        run.status === "succeeded" ? "success" : run.partial ? "outline" : "danger"
                      }
                    >
                      {t(`advertising.historyStatus.${run.status}`)}
                    </Badge>
                  </div>
                  <p className="text-label text-fg-muted mt-1">
                    {t("advertising.rowsSummary", { read: run.rowsRead, written: run.rowsWritten })}
                    {run.errorCode ? ` · ${run.errorCode}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="advertising-reconciliation-history">
          <h3
            id="advertising-reconciliation-history"
            className="text-body text-fg-primary font-semibold"
          >
            {t("advertising.reconciliationTitle")}
          </h3>
          {reconciliations.length === 0 ? (
            <p className="text-label text-fg-secondary mt-2">{t("advertising.noHistory")}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {reconciliations.slice(0, 20).map((row) => (
                <li
                  key={row.id}
                  className="border-border rounded-[var(--radius-control)] border p-3"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="text-body text-fg-primary font-medium">{row.accountName}</span>
                    <Badge variant={row.completeness === "complete" ? "success" : "warning"}>
                      {t(`advertising.historyStatus.${row.completeness}`)}
                    </Badge>
                  </div>
                  <p className="text-label text-fg-muted mt-1">
                    <bdi dir="ltr">{row.reportDate}</bdi> · {t("advertising.providerSpend")}:{" "}
                    {row.providerAccountSpend} {row.currency}
                  </p>
                  <p className="text-label text-fg-muted">
                    {t("advertising.unallocatedSpend")}:{" "}
                    <bdi dir="ltr">
                      {row.unallocatedSpend} {row.currency}
                    </bdi>{" "}
                    · {t("advertising.discrepancy")}:{" "}
                    <bdi dir="ltr">
                      {row.discrepancy} {row.currency}
                    </bdi>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Card>
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
    <Card data-testid={`advertising-connection-${connection.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {connection.status === "active" ? (
            <ShieldCheck className="text-success mt-0.5 h-5 w-5" aria-hidden="true" />
          ) : (
            <ShieldAlert className="text-fg-muted mt-0.5 h-5 w-5" aria-hidden="true" />
          )}
          <div>
            <CardTitle>{connection.displayName}</CardTitle>
            <CardDescription>
              {connection.provider} · {connection.graphApiVersion ?? META_DEFAULT_GRAPH_VERSION} ·{" "}
              {t("advertising.credentialVersion", { count: connection.currentCredentialVersion })}
            </CardDescription>
          </div>
        </div>
        <Badge variant={status}>{t(`advertising.status.${connection.status}`)}</Badge>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <form
          action={credentialAction}
          className="border-border bg-surface-subtle space-y-3 rounded-[var(--radius-control)] border p-4"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="text-fg-muted h-4 w-4" aria-hidden="true" />
            <h3 className="text-body text-fg-primary font-semibold">
              {t("advertising.credentialTitle")}
            </h3>
          </div>
          <p className="text-label text-fg-muted">{t("advertising.credentialDescription")}</p>
          <input type="hidden" name="connectionId" value={connection.id} />
          <Label htmlFor={`advertising-token-${connection.id}`}>
            {t("advertising.accessToken")}
          </Label>
          <PasswordInput
            id={`advertising-token-${connection.id}`}
            name="accessToken"
            autoComplete="new-password"
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

        <div className="border-border bg-surface-subtle space-y-3 rounded-[var(--radius-control)] border p-4">
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
          {validationState.diagnostics?.map((diagnostic) => (
            <div
              key={`${diagnostic.operation}-${diagnostic.state}`}
              className="border-border bg-surface-subtle space-y-1 rounded-[var(--radius-control)] border p-3"
              data-testid={`advertising-diagnostic-${diagnostic.operation}`}
            >
              <p className="text-label text-fg-primary font-semibold">
                {t(`advertising.diagnosticOperations.${diagnostic.operation}`)}
              </p>
              <p className="text-label text-fg-secondary">
                {t(`advertising.diagnostics.${diagnostic.state}`)}
              </p>
              {diagnostic.state !== "valid" ? (
                <p className="text-label text-fg-muted" data-testid="advertising-diagnostic-fix">
                  <span className="font-semibold">{t("advertising.diagnosticToFix")}</span>{" "}
                  {t(`advertising.diagnosticFixes.${diagnostic.state}`)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div
        className="border-border bg-surface-subtle mt-4 space-y-3 rounded-[var(--radius-control)] border p-4"
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
          <ul className="space-y-2">
            {capabilities.map((capability) => (
              <li
                key={capability.id}
                className="border-border flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border p-3"
              >
                <span className="text-body text-fg-primary">
                  {t(`advertising.capabilityLabels.${capability.capability}`)}
                </span>
                <Badge
                  variant={
                    capability.status === "available"
                      ? "success"
                      : capability.status === "unavailable"
                        ? "danger"
                        : "outline"
                  }
                >
                  {t(`advertising.capabilityStatus.${capability.status}`)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        className="border-border bg-surface-subtle mt-4 space-y-3 rounded-[var(--radius-control)] border p-4"
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
          <ul className="space-y-2">
            {socialIdentities.map((identity) => (
              <li
                key={identity.id}
                className="border-border flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border p-3"
              >
                <div>
                  <p className="text-body text-fg-primary font-medium">
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
