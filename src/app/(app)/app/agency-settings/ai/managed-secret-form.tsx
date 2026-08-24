"use client";

import * as React from "react";
import { useActionState } from "react";
import { KeyRound, Server, ShieldCheck } from "lucide-react";
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
}: {
  keySource: "managed_secret" | "environment" | "missing";
  lastFour: string | null;
  enabled: boolean;
  envHasKey: boolean;
  envEnabled: boolean;
}) {
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
    ? `Managed secret · ends in …${lastFour ?? "????"}`
    : envHasKey
      ? "Configured by environment"
      : "Not configured";
  const badgeVariant = isManaged ? "success" : envHasKey ? "info" : "outline";

  return (
    <div className="space-y-4">
      <Card data-testid="ai-provider-status-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Server className="text-primary h-5 w-5" aria-hidden="true" />
            <CardTitle>Provider key</CardTitle>
          </div>
          <Badge variant={badgeVariant} data-testid="ai-provider-status-badge">
            {badge}
          </Badge>
        </div>
        <CardDescription className="mt-2">
          The active key for this agency. A managed secret in the database takes priority; the
          environment key is the fallback. Master switch status: {enabled ? "On" : "Off"}.
        </CardDescription>

        {!isManaged && mode === "idle" ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="default"
              onClick={() => setMode("set")}
              data-testid="ai-managed-secret-set-trigger"
            >
              {envHasKey ? "Replace with managed secret" : "Set managed secret"}
            </Button>
            {!envHasKey && !envEnabled ? (
              <span className="text-label text-warning inline-flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                AI features are disabled until a key is provided.
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
              Replace key
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMode("remove")}
              data-testid="ai-managed-secret-remove-trigger"
            >
              Remove managed secret
            </Button>
          </div>
        ) : null}

        {mode === "set" || mode === "replace" ? (
          <form action={action} className="mt-4 space-y-3" data-testid="ai-managed-secret-form">
            <div className="space-y-1.5">
              <Label htmlFor="ai-managed-secret-key">API key</Label>
              <p className="text-label text-fg-muted -mt-0.5">
                The key is encrypted at rest (AES-256-GCM). Only the last 4 characters are shown
                after save.
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
                  ? `Managed secret saved · ends in …${state.lastFour}. The page will refresh with the new status.`
                  : "Managed secret saved."}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {!state.ok ? (
                <FormSubmitButton
                  label={mode === "replace" ? "Replace key" : "Set managed secret"}
                  pendingLabel={pending ? "Saving…" : "Save"}
                  data-testid="ai-managed-secret-submit"
                />
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMode("idle")}
                disabled={pending}
              >
                {state.ok ? "Close" : "Cancel"}
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
              <Label htmlFor="ai-managed-secret-clear-reason">Reason</Label>
              <p className="text-label text-fg-muted -mt-0.5">
                Removes the managed secret. The agency falls back to the environment key on the next
                request.
              </p>
              <Input
                id="ai-managed-secret-clear-reason"
                name="reason"
                type="text"
                required
                aria-required="true"
                minLength={3}
                maxLength={500}
                placeholder="Off-rotation / switching to env-managed"
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
                Managed secret removed. The agency is back on the environment key.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {!clearState.ok ? (
                <FormSubmitButton
                  label="Remove managed secret"
                  pendingLabel={clearPending ? "Removing…" : "Remove"}
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
                {clearState.ok ? "Close" : "Cancel"}
              </Button>
            </div>
          </form>
        ) : null}
      </Card>

      <div className="border-border bg-surface-subtle text-body text-fg-secondary flex flex-wrap items-start gap-2 rounded-[var(--radius-control)] border p-3">
        <KeyRound className="text-fg-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          {isManaged
            ? "Stored as an encrypted managed secret. The full key is never displayed after the initial paste."
            : "The key lives in the deployment environment (MINIMAX_API_KEY). The UI cannot edit it."}
        </p>
      </div>
    </div>
  );
}
