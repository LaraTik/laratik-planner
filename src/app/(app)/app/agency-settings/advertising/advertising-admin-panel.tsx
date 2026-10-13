"use client";

import * as React from "react";
import { useActionState } from "react";
import { KeyRound, Plus, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  createAdvertisingConnectionAction,
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

const initial: AdvertisingActionState = {};

function stateText(t: (key: string) => string, state: AdvertisingActionState) {
  if (!state.code) return null;
  return t(`advertising.codes.${state.code}`) || t("advertising.codes.advertising_action_failed");
}

export function AdvertisingAdminPanel({ connections }: { connections: readonly Connection[] }) {
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
    </div>
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
