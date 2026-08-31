"use client";

import * as React from "react";
import { useActionState } from "react";
import { Bot, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  saveAiSettingsAction,
  testAiConnectionAction,
  type AiSettingsActionState,
} from "./actions";
import type { MonthlyUsage } from "@/lib/ai/feature-settings";
import { ADMIN_FACING_CAPABILITIES, AI_PROVIDER } from "@/lib/ai/capabilities";

const initial: AiSettingsActionState = {};

/**
 * Agency-level AI configuration form.
 *
 * - Enable / disable the AI feature for the entire agency.
 * - Pick a model from the server allowlist.
 * - Toggle each of the six capabilities from §15.
 * - Test connection (sends a 1-token ping to the provider).
 * - See the last test timestamp + 30-day usage summary.
 *
 * Saved by `saveAiSettingsAction`. "Test connection" calls
 * `testAiConnectionAction` directly (not a form submission) so the
 * test result is reflected in the page via revalidation.
 */
export function AiSettingsForm({
  initialEnabled,
  initialModel,
  initialCapabilities,
  envEnabled,
  envModel,
  envHasKey,
  featureIsEnabled,
  lastTestAt,
  lastTestOk,
  usage,
}: {
  initialEnabled: boolean;
  initialModel: string;
  initialCapabilities: string[];
  envEnabled: boolean;
  envModel: string;
  envHasKey: boolean;
  // True when AI can run: the env kill-switch is on AND a key exists
  // (env or managed). The form uses this to enable the master switch
  // and the Test connection button.
  featureIsEnabled: boolean;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  usage: MonthlyUsage;
}) {
  const [state, formAction] = useActionState(saveAiSettingsAction, initial);
  const [testState, setTestState] = React.useState<AiSettingsActionState>({});
  const [testing, setTesting] = React.useState(false);

  const allowedModels = React.useMemo(
    () => Array.from(new Set([envModel, "MiniMax-M3", "MiniMax-M2"])),
    [envModel],
  );

  const onTest = async () => {
    setTesting(true);
    try {
      const result = await testAiConnectionAction();
      setTestState(result);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card data-testid="ai-environment-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot className="text-primary h-5 w-5" aria-hidden="true" />
            <CardTitle>Provider environment</CardTitle>
          </div>
          <Badge variant={envEnabled && envHasKey ? "success" : "outline"}>
            {envEnabled && envHasKey ? "Configured" : "Not configured"}
          </Badge>
        </div>
        <CardDescription className="mt-2">
          {AI_PROVIDER.vendor} provides the {AI_PROVIDER.compat} API at{" "}
          <code className="bg-surface rounded px-1.5 py-0.5">{AI_PROVIDER.baseUrlEnv}</code>. The
          provider key is read from the deployment environment; we never display or store the full
          key in the database. If you later switch to a managed secret, the UI will show a masked
          suffix only.
        </CardDescription>
        <dl className="mt-5 space-y-3">
          <Row label="Provider" value={AI_PROVIDER.vendor} />
          <Row label="API compat" value={AI_PROVIDER.compat} />
          <Row label="Default model" value={envModel} />
          <Row
            label="Key source"
            value={envHasKey ? "Configured by environment" : "Missing in environment"}
          />
        </dl>
      </Card>

      <form action={formAction} className="space-y-4" data-testid="ai-settings-form">
        <Card data-testid="ai-feature-card">
          <CardTitle className="mb-1">Feature settings</CardTitle>
          <CardDescription>
            The toggle below is the master switch. When disabled, every AI capability stops working
            across the agency — even if a capability is individually toggled on.
          </CardDescription>

          <div className="mt-5 space-y-5">
            <div className="bg-surface-subtle flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] p-3">
              <div>
                <p className="text-body text-fg-primary font-semibold">Enable AI assistance</p>
                <p className="text-label text-fg-muted">
                  Master switch for the entire agency. Requires a configured provider key (env or
                  managed secret).
                </p>
              </div>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={initialEnabled && featureIsEnabled}
                  disabled={!featureIsEnabled}
                  className="h-4 w-4"
                  data-testid="ai-enabled-toggle"
                />
                <span className="text-label text-fg-primary font-semibold">
                  {initialEnabled && featureIsEnabled ? "On" : "Off"}
                </span>
              </label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-model">Model</Label>
              <p className="text-label text-fg-muted -mt-0.5">Limited to the server allowlist.</p>
              <select
                id="ai-model"
                name="model"
                defaultValue={initialModel}
                className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full max-w-sm rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
                data-testid="ai-model-select"
              >
                {allowedModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-title-card text-fg-primary font-semibold">
                Capabilities
              </legend>
              <p className="text-label text-fg-muted">
                Each capability surfaces a button in the planning flow. Off capabilities stay hidden
                in the UI.
              </p>
              <ul className="mt-3 space-y-2" data-testid="ai-capability-toggle-list">
                {ADMIN_FACING_CAPABILITIES.map((cap) => (
                  <li
                    key={cap.id}
                    className="border-border bg-surface-subtle flex flex-wrap items-start justify-between gap-2 rounded-[var(--radius-control)] border p-3"
                    data-testid={`ai-capability-toggle-${cap.id}`}
                  >
                    <div className="min-w-0">
                      <p
                        className="text-body text-fg-primary font-semibold"
                        data-testid={`ai-capability-label-${cap.id}`}
                      >
                        {cap.adminLabel}
                      </p>
                      <p className="text-label text-fg-muted mt-0.5">{cap.description}</p>
                    </div>
                    <label className="text-label text-fg-primary inline-flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        name={`cap_${cap.id}`}
                        defaultChecked={initialCapabilities.includes(cap.id)}
                        className="h-4 w-4"
                        data-testid={`ai-capability-checkbox-${cap.id}`}
                      />
                      {initialCapabilities.includes(cap.id) ? "On" : "Off"}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          </div>

          {state.error ? (
            <p
              role="alert"
              data-testid="ai-settings-error"
              className="text-body text-danger mt-4 font-semibold"
            >
              {state.error}
            </p>
          ) : null}
          {state.saved ? (
            <p
              role="status"
              data-testid="ai-settings-saved"
              className="text-body text-success mt-4 font-semibold"
            >
              {state.saved}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            <FormSubmitButton label="Save AI settings" pendingLabel="Saving…" />
          </div>
        </Card>
      </form>

      <Card data-testid="ai-test-connection-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Test connection</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onTest}
            disabled={testing || !featureIsEnabled}
            data-testid="ai-test-connection"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${testing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {testing ? "Testing…" : "Run test"}
          </Button>
        </div>
        <CardDescription className="mt-2">
          Sends a 1-token ping to the provider. The result is stored as the last test status.
        </CardDescription>
        <dl className="mt-4 space-y-2">
          <Row label="Last test" value={lastTestAt ?? "Never"} />
          <Row
            label="Last test result"
            value={
              lastTestOk === null
                ? "Not yet tested"
                : lastTestOk
                  ? "OK"
                  : "Failed — check API key and base URL"
            }
            tone={lastTestOk === null ? "muted" : lastTestOk ? "success" : "danger"}
          />
        </dl>
        {testState.error ? (
          <p role="alert" className="text-body text-danger mt-3 font-semibold">
            {testState.error}
          </p>
        ) : null}
        {testState.saved ? (
          <p role="status" className="text-body text-success mt-3 font-semibold">
            {testState.saved}
          </p>
        ) : null}
      </Card>

      <Card data-testid="ai-usage-card">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary h-5 w-5" aria-hidden="true" />
          <CardTitle>30-day usage</CardTitle>
        </div>
        <CardDescription className="mt-2">
          Counts of AI requests by capability, agency-wide. Per-workspace breakdowns live on each
          workspace&apos;s AI status card.
        </CardDescription>
        <dl className="mt-5 space-y-3">
          <Row label="Total requests" value={String(usage.total)} />
          <Row label="Succeeded" value={String(usage.succeeded)} tone="success" />
          <Row
            label="Failed"
            value={String(usage.failed)}
            tone={usage.failed > 0 ? "danger" : "muted"}
          />
        </dl>
        {usage.byCapability.length > 0 ? (
          <ul
            className="border-border mt-4 space-y-1.5 border-t pt-3"
            data-testid="ai-usage-by-capability"
          >
            {usage.byCapability.map((row) => (
              <li
                key={row.capability}
                className="text-body text-fg-primary flex flex-wrap items-center justify-between gap-2"
              >
                <span>{row.capability}</span>
                <span className="text-label text-fg-muted font-semibold">{row.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div
            className="border-border mt-4 flex flex-col items-center gap-1 rounded-[var(--radius-control)] border border-dashed py-6 text-center"
            data-testid="ai-usage-empty"
          >
            <Sparkles className="text-fg-muted h-5 w-5" aria-hidden="true" />
            <p className="text-body text-fg-secondary font-semibold">No usage yet</p>
            <p className="text-label text-fg-muted max-w-sm">
              Run your first AI request from a content brief to see this card fill in.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "muted" | "success" | "danger";
}) {
  const valueClass =
    tone === "muted"
      ? "text-fg-muted"
      : tone === "success"
        ? "text-success"
        : tone === "danger"
          ? "text-danger"
          : "text-fg-primary";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <dt className="text-body text-fg-secondary">{label}</dt>
      <dd className={`text-body text-end font-semibold ${valueClass}`}>{value}</dd>
    </div>
  );
}
