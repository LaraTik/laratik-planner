"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertTriangle, KeyRound, Server, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import {
  setManagedAiSecretAction,
  clearManagedAiSecretAction,
  type ManagedSecretActionState,
} from "./actions";
import type { KekStatus } from "@/lib/security/secrets";
import { useLocaleT } from "@/components/i18n/locale-provider";

const initial: ManagedSecretActionState = {};

/**
 * Managed-secret form (M3.4 — AI in-DB secret).
 *
 * Renders one of three states:
 *   1. "Managed secret · ends in …abcd" — when the agency has a
 *      stored secret. The "Replace key" + "Remove managed secret"
 *      actions are wired.
 *   2. "Configured by environment" — when the env key is set but
 *      no managed secret. A "Set managed secret" form is shown.
 *   3. "Not configured" — when neither is set. Same form as (2)
 *      with an additional warning that AI features will be
 *      disabled until a key is provided.
 *
 * When the KEK is auto-managed (no env var, file in data dir),
 * a yellow "back this up" banner is rendered above the form
 * action. The banner is non-blocking — the form still works —
 * but tells the operator where the file lives and that losing
 * it locks out every stored AI provider key.
 *
 * The "Save" action runs `setManagedAiSecretAction` and
 * revalidates the page on success. The action state surfaces
 * success / error inline.
 */
export function ManagedSecretForm({
  keySource,
  lastFour,
  enabled,
  envHasKey,
  envEnabled,
  kekStatus,
}: {
  keySource: "managed_secret" | "environment" | "missing";
  lastFour: string | null;
  enabled: boolean;
  envHasKey: boolean;
  envEnabled: boolean;
  kekStatus: KekStatus;
}) {
  const t = useLocaleT();
  const [mode, setMode] = React.useState<"idle" | "set" | "replace" | "remove">("idle");
  const [state, action, pending] = useActionState(setManagedAiSecretAction, initial);
  const [clearState, clearAction, clearPending] = useActionState(
    clearManagedAiSecretAction,
    initial,
  );

  // The page revalidates with the new keySource after a successful
  // save. The form re-mounts via the parent's `key` prop. The user
  // can also click the "Cancel" button to close the expanded form.
  // We intentionally do NOT auto-set `mode = "idle"` from a
  // useEffect (React 19: setState in effect is a perf footgun).

  const isManaged = keySource === "managed_secret";
  const badge = isManaged
    ? t("agencyAi.managedSecret.badge", { suffix: lastFour ?? "????" })
    : envHasKey
      ? t("agencyAi.form.configuredByEnvironment")
      : t("agencyAi.form.notConfigured");
  const badgeVariant = isManaged ? "success" : envHasKey ? "info" : "outline";

  return (
    <div className="space-y-4">
      <Card data-testid="ai-provider-status-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Server className="text-primary h-5 w-5" aria-hidden="true" />
            <CardTitle>{t("agencyAi.managedSecret.providerKey")}</CardTitle>
          </div>
          <Badge variant={badgeVariant} data-testid="ai-provider-status-badge">
            {badge}
          </Badge>
        </div>
        <CardDescription className="mt-2">
          {t("agencyAi.managedSecret.description", {
            status: enabled ? t("agencyAi.form.on") : t("agencyAi.form.off"),
          })}
        </CardDescription>

        {kekStatus.source === "auto-file" ? (
          <div
            className="border-border bg-warning-soft text-body text-fg-primary mt-4 flex items-start gap-2 rounded-[var(--radius-control)] border p-3"
            data-testid="ai-kek-backup-banner"
            role="alert"
          >
            <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {kekStatus.warning?.includes("Will be") || kekStatus.warning?.includes("unreadable")
                  ? t("agencyAi.managedSecret.autoManagedTitle")
                  : t("agencyAi.managedSecret.backupTitle")}
              </p>
              <p className="text-fg-secondary mt-1">
                {t("agencyAi.managedSecret.autoManagedDescription")}{" "}
                <code>AI_SECRET_ENCRYPTION_KEY</code>{" "}
                {t("agencyAi.managedSecret.autoManagedDescriptionMiddle")}{" "}
                <code className="bg-surface rounded px-1.5 py-0.5 break-all">{kekStatus.path}</code>
                {t("agencyAi.managedSecret.autoManagedDescriptionSuffix")}
              </p>
              <p className="text-fg-secondary mt-1">
                {kekStatus.warning ?? t("agencyAi.managedSecret.warningFallback")}
                {kekStatus.createdAt ? (
                  <>
                    {" "}
                    {t("agencyAi.managedSecret.createdAt")} <code>{kekStatus.createdAt}</code>.
                  </>
                ) : null}
              </p>
              <p className="text-fg-muted mt-1">
                {t("agencyAi.managedSecret.takeControlPrefix")}{" "}
                <code>AI_SECRET_ENCRYPTION_KEY</code>{" "}
                {t("agencyAi.managedSecret.takeControlSuffix")}
              </p>
            </div>
          </div>
        ) : null}

        {kekStatus.source === "dev-fallback" ? (
          <div
            className="border-border bg-warning-soft text-body text-fg-primary mt-4 flex items-start gap-2 rounded-[var(--radius-control)] border p-3"
            data-testid="ai-kek-dev-fallback-banner"
            role="alert"
          >
            <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">{t("agencyAi.managedSecret.devFallbackTitle")}</p>
              <p className="text-fg-secondary mt-1">
                {t("agencyAi.managedSecret.devFallbackDescription")}{" "}
                <code>AI_SECRET_ENCRYPTION_KEY</code>{" "}
                {t("agencyAi.managedSecret.devFallbackDescriptionSuffix")}
              </p>
            </div>
          </div>
        ) : null}

        {!isManaged && mode === "idle" ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="default"
              onClick={() => setMode("set")}
              data-testid="ai-managed-secret-set-trigger"
            >
              {envHasKey
                ? t("agencyAi.managedSecret.replaceWithManaged")
                : t("agencyAi.managedSecret.setManaged")}
            </Button>
            {!envHasKey && !envEnabled ? (
              <span className="text-label text-warning inline-flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t("agencyAi.managedSecret.disabledUntilKey")}
              </span>
            ) : null}
          </div>
        ) : null}

        {isManaged && mode === "idle" ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMode("replace")}
              data-testid="ai-managed-secret-replace-trigger"
            >
              {t("agencyAi.managedSecret.replaceKey")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMode("remove")}
              data-testid="ai-managed-secret-remove-trigger"
            >
              {t("agencyAi.managedSecret.removeManagedSecret")}
            </Button>
          </div>
        ) : null}

        {mode === "set" || mode === "replace" ? (
          <form action={action} className="mt-4 space-y-3" data-testid="ai-managed-secret-form">
            <div className="space-y-1.5">
              <Label htmlFor="ai-managed-secret-key">{t("agencyAi.managedSecret.apiKey")}</Label>
              <p className="text-label text-fg-muted -mt-0.5">
                {t("agencyAi.managedSecret.apiKeyDescription")}
              </p>
              <Input
                id="ai-managed-secret-key"
                name="apiKey"
                type="password"
                required
                aria-required="true"
                minLength={12}
                maxLength={256}
                placeholder="sk-…"
                autoComplete="off"
                data-testid="ai-managed-secret-key"
              />
            </div>
            {state.error ? (
              <p
                role="alert"
                data-testid="ai-managed-secret-error"
                className="text-body text-danger font-semibold"
              >
                {state.error}
              </p>
            ) : null}
            {state.ok ? (
              <p
                role="status"
                data-testid="ai-managed-secret-success"
                className="text-body text-success font-semibold"
              >
                {state.lastFour
                  ? t("agencyAi.managedSecret.savedWithSuffix", { suffix: state.lastFour })
                  : t("agencyAi.managedSecret.saved")}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {!state.ok ? (
                <FormSubmitButton
                  label={
                    mode === "replace"
                      ? t("agencyAi.managedSecret.replaceKey")
                      : t("agencyAi.managedSecret.setManaged")
                  }
                  pendingLabel={pending ? t("agencyAi.form.saving") : t("agencyAi.form.save")}
                  data-testid="ai-managed-secret-submit"
                />
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMode("idle")}
                disabled={pending}
              >
                {state.ok ? t("agencyAi.managedSecret.close") : t("agencyAi.form.cancel")}
              </Button>
            </div>
          </form>
        ) : null}

        {mode === "remove" ? (
          <form
            action={clearAction}
            className="mt-4 space-y-3"
            data-testid="ai-managed-secret-clear-form"
          >
            <div className="space-y-1.5">
              <Label htmlFor="ai-managed-secret-clear-reason">
                {t("agencyAi.managedSecret.reason")}
              </Label>
              <p className="text-label text-fg-muted -mt-0.5">
                {t("agencyAi.managedSecret.removeDescription")}
              </p>
              <Input
                id="ai-managed-secret-clear-reason"
                name="reason"
                type="text"
                required
                aria-required="true"
                minLength={3}
                maxLength={500}
                placeholder={t("agencyAi.managedSecret.reasonPlaceholder")}
                data-testid="ai-managed-secret-clear-reason"
              />
            </div>
            {clearState.error ? (
              <p
                role="alert"
                data-testid="ai-managed-secret-clear-error"
                className="text-body text-danger font-semibold"
              >
                {clearState.error}
              </p>
            ) : null}
            {clearState.ok ? (
              <p
                role="status"
                data-testid="ai-managed-secret-clear-success"
                className="text-body text-success font-semibold"
              >
                {t("agencyAi.managedSecret.removedSuccess")}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {!clearState.ok ? (
                <FormSubmitButton
                  label={t("agencyAi.managedSecret.removeManagedSecret")}
                  pendingLabel={
                    clearPending
                      ? t("agencyAi.managedSecret.removing")
                      : t("agencyAi.managedSecret.remove")
                  }
                  variant="destructive"
                  data-testid="ai-managed-secret-clear-submit"
                />
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMode("idle")}
                disabled={clearPending}
              >
                {clearState.ok ? t("agencyAi.managedSecret.close") : t("agencyAi.form.cancel")}
              </Button>
            </div>
          </form>
        ) : null}
      </Card>

      <div className="border-border bg-surface-subtle text-body text-fg-secondary flex flex-wrap items-start gap-2 rounded-[var(--radius-control)] border p-3">
        <KeyRound className="text-fg-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          {isManaged
            ? t("agencyAi.managedSecret.managedNote")
            : t("agencyAi.managedSecret.environmentNote")}
        </p>
      </div>
    </div>
  );
}
