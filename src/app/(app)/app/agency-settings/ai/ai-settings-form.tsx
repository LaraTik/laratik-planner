"use client";

import * as React from "react";
import { useActionState } from "react";
import { Bot, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  saveAiSettingsAction,
  testAiConnectionAction,
  type AiSettingsActionState,
} from "./actions";
import type { MonthlyUsage } from "@/lib/ai/feature-settings";
import { ADMIN_FACING_CAPABILITIES, AI_PROVIDER } from "@/lib/ai/capabilities";
import { useLocaleT } from "@/components/i18n/locale-provider";

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
  const t = useLocaleT();
  const tr = (key: string, fallback: string) => t(key) || fallback;
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
            <CardTitle>{tr("agencyAi.providerEnvTitle", "Provider environment")}</CardTitle>
          </div>
          <Badge variant={envEnabled && envHasKey ? "success" : "outline"}>
            {envEnabled && envHasKey
              ? t("agencyAi.form.configured")
              : t("agencyAi.form.notConfigured")}
          </Badge>
        </div>
        <CardDescription className="mt-2">
          {t("agencyAi.form.providerDescription", {
            vendor: AI_PROVIDER.vendor,
            compat: AI_PROVIDER.compat,
          })}{" "}
          <code className="bg-surface rounded px-1.5 py-0.5">{AI_PROVIDER.baseUrlEnv}</code>.{" "}
          {t("agencyAi.form.providerDescriptionSuffix")}
        </CardDescription>
        <dl className="mt-5 space-y-3">
          <Row label={t("agencyAi.form.provider")} value={AI_PROVIDER.vendor} />
          <Row label={t("agencyAi.form.apiCompat")} value={AI_PROVIDER.compat} />
          <Row label={t("agencyAi.form.defaultModel")} value={envModel} />
          <Row
            label={t("agencyAi.form.keySource")}
            value={
              envHasKey
                ? t("agencyAi.form.configuredByEnvironment")
                : t("agencyAi.form.missingInEnvironment")
            }
          />
        </dl>
      </Card>

      <form action={formAction} className="space-y-4" data-testid="ai-settings-form">
        <Card data-testid="ai-feature-card">
          <CardTitle className="mb-1">
            {tr("agencyAi.featureSettingsTitle", "Feature settings")}
          </CardTitle>
          <CardDescription>{t("agencyAi.form.featureSettingsDescription")}</CardDescription>

          <div className="mt-5 space-y-5">
            <div className="bg-surface-subtle flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] p-3">
              <div>
                <p className="text-body text-fg-primary font-semibold">
                  {t("agencyAi.form.enableAi")}
                </p>
                <p className="text-label text-fg-muted">{t("agencyAi.form.enableAiDescription")}</p>
              </div>
              <div className="inline-flex items-center gap-2">
                <Checkbox
                  id="ai-enabled-toggle"
                  name="enabled"
                  value="on"
                  defaultChecked={initialEnabled && featureIsEnabled}
                  disabled={!featureIsEnabled}
                  data-testid="ai-enabled-toggle"
                />
                <label
                  htmlFor="ai-enabled-toggle"
                  className="text-label text-fg-primary cursor-pointer font-semibold"
                >
                  {initialEnabled && featureIsEnabled
                    ? t("agencyAi.form.on")
                    : t("agencyAi.form.off")}
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-model">{t("agencyAi.form.model")}</Label>
              <p className="text-label text-fg-muted -mt-0.5">
                {t("agencyAi.form.modelDescription")}
              </p>
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
                {t("agencyAi.form.capabilities")}
              </legend>
              <p className="text-label text-fg-muted">
                {t("agencyAi.form.capabilitiesDescription")}
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
                        {t(`agencyAi.capabilities.${cap.id}.adminLabel`)}
                      </p>
                      <p className="text-label text-fg-muted mt-0.5">
                        {t(`agencyAi.capabilities.${cap.id}.description`)}
                      </p>
                    </div>
                    <div className="text-label text-fg-primary inline-flex items-center gap-2 font-semibold">
                      <Checkbox
                        id={`ai-capability-${cap.id}`}
                        name={`cap_${cap.id}`}
                        value="on"
                        defaultChecked={initialCapabilities.includes(cap.id)}
                        data-testid={`ai-capability-checkbox-${cap.id}`}
                      />
                      <label htmlFor={`ai-capability-${cap.id}`} className="cursor-pointer">
                        {initialCapabilities.includes(cap.id)
                          ? t("agencyAi.form.on")
                          : t("agencyAi.form.off")}
                      </label>
                    </div>
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
            <FormSubmitButton
              label={t("agencyAi.form.save")}
              pendingLabel={t("agencyAi.form.saving")}
            />
          </div>
        </Card>
      </form>

      <Card data-testid="ai-test-connection-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{tr("agencyAi.testConnectionTitle", "Test connection")}</CardTitle>
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
            {testing ? t("agencyAi.form.testing") : t("agencyAi.form.runTest")}
          </Button>
        </div>
        <CardDescription className="mt-2">
          {t("agencyAi.form.testConnectionDescription")}
        </CardDescription>
        <dl className="mt-4 space-y-2">
          <Row label={t("agencyAi.form.lastTest")} value={lastTestAt ?? t("agencyAi.form.never")} />
          <Row
            label={t("agencyAi.form.lastTestResult")}
            value={
              lastTestOk === null
                ? t("agencyAi.form.notYetTested")
                : lastTestOk
                  ? t("agencyAi.form.ok")
                  : t("agencyAi.form.testFailed")
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
          <CardTitle>{t("agencyAi.form.usageTitle")}</CardTitle>
        </div>
        <CardDescription className="mt-2">{t("agencyAi.form.usageDescription")}</CardDescription>
        <dl className="mt-5 space-y-3">
          <Row label={t("agencyAi.form.totalRequests")} value={String(usage.total)} />
          <Row
            label={t("agencyAi.form.succeeded")}
            value={String(usage.succeeded)}
            tone="success"
          />
          <Row
            label={t("agencyAi.form.failed")}
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
                <span>
                  {t(`agencyAi.capabilities.${row.capability}.adminLabel`) || row.capability}
                </span>
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
            <p className="text-body text-fg-secondary font-semibold">
              {tr("agencyAi.noUsageYet", "No usage yet")}
            </p>
            <p className="text-label text-fg-muted max-w-sm">
              {t("agencyAi.form.noUsageDescription")}
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
