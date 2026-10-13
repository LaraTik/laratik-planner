"use client";

import * as React from "react";
import { useActionState } from "react";
import { KeyRound, Plus, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { PasswordInput } from "@/components/forms/password-input";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  createAdvertisingConnectionAction,
  grantAdvertisingFinancialAuthorityAction,
  grantAdvertisingVisibilityAction,
  revokeAdvertisingConnectionAction,
  storeAdvertisingCredentialAction,
  validateAdvertisingConnectionAction,
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

const initial: AdvertisingActionState = {};

function stateText(t: (key: string) => string, state: AdvertisingActionState) {
  if (!state.code) return null;
  return t(`advertising.codes.${state.code}`) || t("advertising.codes.advertising_action_failed");
}

export function AdvertisingAdminPanel({
  connections,
  accounts,
  workspaces,
}: {
  connections: readonly Connection[];
  accounts: readonly AdvertisingAccount[];
  workspaces: readonly Workspace[];
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
              defaultValue="v25.0"
              pattern="v\\d+\\.\\d+"
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
          <ConnectionCard key={connection.id} connection={connection} />
        ))
      )}
      <GrantAccessCard accounts={accounts} workspaces={workspaces} />
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
}: {
  accounts: readonly AdvertisingAccount[];
  workspaces: readonly Workspace[];
}) {
  const t = useLocaleT();
  const [grantState, grantAction] = useActionState(grantAdvertisingVisibilityAction, initial);
  const [financialState, financialAction] = useActionState(
    grantAdvertisingFinancialAuthorityAction,
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
        </div>
      )}
    </Card>
  );
}

function ConnectionCard({ connection }: { connection: Connection }) {
  const t = useLocaleT();
  const [credentialState, credentialAction] = useActionState(
    storeAdvertisingCredentialAction,
    initial,
  );
  const [revokeState, revokeAction] = useActionState(revokeAdvertisingConnectionAction, initial);
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
              {connection.provider} · {connection.graphApiVersion ?? "v25.0"} ·{" "}
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
            <p
              key={`${diagnostic.operation}-${diagnostic.state}`}
              className="text-label text-fg-secondary"
            >
              {t(`advertising.diagnostics.${diagnostic.state}`)}
            </p>
          ))}
        </div>
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
