import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { db } from "@/lib/db";
import {
  agencies,
  agencyEntitlements,
  aiFeatureSettings,
  aiUsageEvents,
  platformPlanTemplates,
} from "@/lib/db/schema";
import { getEffectiveEntitlement } from "@/lib/entitlements";
import { ALL_AI_CAPABILITIES, ALL_PLATFORM_KEYS, OverrideShapeSchema } from "@/lib/entitlements";
import { getUsage } from "@/lib/usage";
import { changePlanAction } from "../actions";
import { PermissionNotice } from "@/components/platform/permission-notice";
import { AgencyLifecycleControls } from "./agency-lifecycle-controls";
import { AI_PROVIDER, getAiCapabilityMetadata } from "@/lib/ai/capabilities";

type Translator = (key: string, params?: Record<string, string | number>) => string;

const EN_USAGE_RESOURCE_LABELS: Record<string, string> = {
  workspaces: "Workspaces",
  users: "Users",
  total_social_profiles: "Social profiles total",
  storage_bytes: "Storage bytes",
  monthly_ai_requests: "AI requests / month",
  monthly_ai_input_tokens: "AI input tokens / month",
  monthly_ai_output_tokens: "AI output tokens / month",
  daily_ai_requests_per_user: "AI requests / user / day",
  max_output_tokens_per_request: "Output tokens / request",
};

const EN_USAGE_LEVEL_LABELS: Record<string, string> = {
  healthy: "healthy",
  warning: "warning",
  urgent: "urgent",
  over_limit: "over limit",
};

function resourceLabel(resource: string, t: Translator): string {
  const key = `platform.usageResource.${resource}`;
  const value = t(key);
  return value.startsWith("[") ? (EN_USAGE_RESOURCE_LABELS[resource] ?? resource) : value;
}

function levelLabel(level: string, t: Translator): string {
  const key = `platform.usageLevel.${level}`;
  const value = t(key);
  return value.startsWith("[") ? (EN_USAGE_LEVEL_LABELS[level] ?? level) : value;
}

function capabilityLabel(capability: string, t: Translator): string {
  const key = `platform.aiCapability.${capability}`;
  const value = t(key);
  return value.startsWith("[") ? capability.replaceAll("_", " ") : value;
}

function platformLabel(platform: string, t: Translator): string {
  const key = `platform.platformKey.${platform}`;
  const value = t(key);
  return value.startsWith("[") ? platform : value;
}

export async function PlanAiSections({
  agencyId,
  agencyName,
  canManagePlan,
  canManageLifecycle,
  canArchive,
  t,
}: {
  agencyId: string;
  agencyName: string;
  canManagePlan: boolean;
  canManageLifecycle: boolean;
  canArchive: boolean;
  t?: Translator;
}) {
  const tr: Translator = t ?? ((key) => key);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const resetAt = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const [agency, entitlement, plans, aiSettings, aiRows, capabilityRows, usage, effective] =
    await Promise.all([
      db
        .select({ suspendedAt: agencies.suspendedAt, archivedAt: agencies.archivedAt })
        .from(agencies)
        .where(eq(agencies.id, agencyId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({
          planTemplateId: agencyEntitlements.planTemplateId,
          planName: platformPlanTemplates.name,
          overrides: agencyEntitlements.overrides,
        })
        .from(agencyEntitlements)
        .innerJoin(
          platformPlanTemplates,
          eq(platformPlanTemplates.id, agencyEntitlements.planTemplateId),
        )
        .where(eq(agencyEntitlements.agencyId, agencyId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({ id: platformPlanTemplates.id, name: platformPlanTemplates.name })
        .from(platformPlanTemplates)
        .where(isNull(platformPlanTemplates.archivedAt)),
      db
        .select()
        .from(aiFeatureSettings)
        .where(eq(aiFeatureSettings.agencyId, agencyId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({
          requests: sql<number>`count(*)::int`,
          inputTokens: sql<number>`coalesce(sum(${aiUsageEvents.inputTokens}), 0)::int`,
          outputTokens: sql<number>`coalesce(sum(${aiUsageEvents.outputTokens}), 0)::int`,
        })
        .from(aiUsageEvents)
        .where(and(eq(aiUsageEvents.agencyId, agencyId), gte(aiUsageEvents.createdAt, monthStart))),
      db
        .select({ capability: aiUsageEvents.capability, requests: sql<number>`count(*)::int` })
        .from(aiUsageEvents)
        .where(and(eq(aiUsageEvents.agencyId, agencyId), gte(aiUsageEvents.createdAt, monthStart)))
        .groupBy(aiUsageEvents.capability),
      getUsage(db, agencyId),
      getEffectiveEntitlement({ agencyId }),
    ]);
  if (!agency || !entitlement) return null;
  const ai = aiRows[0] ?? { requests: 0, inputTokens: 0, outputTokens: 0 };
  const configuredCapabilities = new Set(aiSettings?.enabledCapabilities ?? []);
  const enabledCapabilities = [...effective.enabledAiCapabilities].filter(
    (capability) => aiSettings?.enabled && configuredCapabilities.has(capability),
  );
  const lifecycleKey = agency.archivedAt
    ? "platform.lifecycleArchived"
    : agency.suspendedAt
      ? "platform.lifecycleSuspended"
      : "platform.lifecycleActive";
  const lifecycle = tr(lifecycleKey);
  const overrides = OverrideShapeSchema.parse(entitlement.overrides ?? {});

  return (
    <div className="space-y-5">
      <Card id="plan" padding="lg" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{tr("platform.planTitle")}</CardTitle>
            <CardDescription>{tr("platform.planDescription")}</CardDescription>
          </div>
          <Badge variant={lifecycleKey === "platform.lifecycleActive" ? "success" : "warning"}>
            {lifecycle}
          </Badge>
        </div>
        {canManagePlan ? (
          <form action={changePlanAction} className="grid gap-4">
            <input type="hidden" name="agencyId" value={agencyId} />
            <input type="hidden" name="overrideForm" value="1" />
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <select
                aria-label={tr("platform.planAriaTemplate")}
                name="planTemplateId"
                defaultValue={entitlement.planTemplateId}
                className="border-border bg-surface rounded-[var(--radius-control)] border px-3 py-2"
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
              <input
                aria-label={tr("platform.planAriaReason")}
                name="reason"
                required
                minLength={3}
                placeholder={tr("platform.planPlaceholderReason")}
                className="border-border bg-surface rounded-[var(--radius-control)] border px-3 py-2"
              />
              <Button type="submit">{tr("platform.planSave")}</Button>
            </div>
            <details className="border-border rounded-[var(--radius-control)] border p-4">
              <summary className="text-body text-fg-primary cursor-pointer font-semibold">
                {tr("platform.planOverridesSummary")}
              </summary>
              <p className="text-label text-fg-muted mt-2">{tr("platform.planOverridesHelp")}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <LimitInput
                  label={tr("platform.usageResource.workspaces")}
                  field="workspaces"
                  value={overrides.workspaces}
                />
                <LimitInput
                  label={tr("platform.usageResource.users")}
                  field="users"
                  value={overrides.users}
                />
                <LimitInput
                  label={tr("platform.usageResource.total_social_profiles")}
                  field="total_social_profiles"
                  value={overrides.total_social_profiles}
                />
                <LimitInput
                  label={tr("platform.usageResource.storage_bytes")}
                  field="storage_bytes"
                  value={overrides.storage_bytes}
                />
                <LimitInput
                  label={tr("platform.usageResource.monthly_ai_requests")}
                  field="monthly_ai_requests"
                  value={overrides.monthly_ai_requests}
                />
                <LimitInput
                  label={tr("platform.usageResource.monthly_ai_input_tokens")}
                  field="monthly_ai_input_tokens"
                  value={overrides.monthly_ai_input_tokens}
                />
                <LimitInput
                  label={tr("platform.usageResource.monthly_ai_output_tokens")}
                  field="monthly_ai_output_tokens"
                  value={overrides.monthly_ai_output_tokens}
                />
                <LimitInput
                  label={tr("platform.usageResource.daily_ai_requests_per_user")}
                  field="daily_ai_requests_per_user"
                  value={overrides.daily_ai_requests_per_user}
                />
                <LimitInput
                  label={tr("platform.usageResource.max_output_tokens_per_request")}
                  field="max_output_tokens_per_request"
                  value={overrides.max_output_tokens_per_request}
                />
              </div>
              <fieldset className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <legend className="text-label text-fg-secondary mb-2 font-semibold">
                  {tr("platform.planSocialProfilesLegend")}
                </legend>
                {ALL_PLATFORM_KEYS.map((platform) => (
                  <LimitInput
                    key={platform}
                    label={platformLabel(platform, tr)}
                    socialPlatform={platform}
                    value={overrides.social_profiles_by_platform?.[platform]}
                  />
                ))}
              </fieldset>
              <fieldset className="mt-4 flex flex-wrap gap-3">
                <legend className="text-label text-fg-secondary mb-2 font-semibold">
                  {tr("platform.planAiCeilingLegend")}
                </legend>
                {ALL_AI_CAPABILITIES.map((capability) => (
                  <div
                    key={capability}
                    className="text-label text-fg-secondary inline-flex items-center gap-2"
                  >
                    <Checkbox
                      id={`override-capability-${capability}`}
                      name="override_enabled_capabilities"
                      value={capability}
                      defaultChecked={
                        overrides.enabled_capabilities?.includes(capability) ??
                        effective.enabledAiCapabilities.has(capability)
                      }
                    />
                    <label htmlFor={`override-capability-${capability}`} className="cursor-pointer">
                      {capabilityLabel(capability, tr)}
                    </label>
                  </div>
                ))}
              </fieldset>
            </details>
          </form>
        ) : (
          <PermissionNotice
            title={tr("platform.planReadOnlyTitle")}
            description={tr("platform.planReadOnlyBody")}
          />
        )}
        <AgencyLifecycleControls
          agencyId={agencyId}
          agencyName={agencyName}
          lifecycle={agency.archivedAt ? "archived" : agency.suspendedAt ? "suspended" : "active"}
          canManageLifecycle={canManageLifecycle}
          canArchive={canArchive}
          t={tr}
        />
      </Card>

      <Card id="usage" padding="lg" className="space-y-4">
        <div>
          <CardTitle>{tr("platform.usageTitle")}</CardTitle>
          <CardDescription>{tr("platform.usageDescription")}</CardDescription>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(usage.thresholds).map(([resource, snapshot]) => (
            <div
              key={resource}
              className="border-border rounded-[var(--radius-control)] border p-3"
            >
              <p className="text-label text-fg-muted">{resourceLabel(resource, tr)}</p>
              <p className="text-title-card text-fg-primary font-semibold">
                {usage.counters[resource] ?? 0} / {snapshot.limit ?? "∞"}
              </p>
              <Badge
                variant={
                  snapshot.level === "healthy"
                    ? "success"
                    : snapshot.level === "over_limit"
                      ? "danger"
                      : "warning"
                }
              >
                {levelLabel(snapshot.level, tr)}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card id="ai" padding="lg" className="space-y-4">
        <div>
          <CardTitle>{tr("platform.aiTitle")}</CardTitle>
          <CardDescription>{tr("platform.aiDescription")}</CardDescription>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label={tr("platform.aiMetricRequests")} value={ai.requests} />
          <Metric label={tr("platform.aiMetricInputTokens")} value={ai.inputTokens} />
          <Metric label={tr("platform.aiMetricOutputTokens")} value={ai.outputTokens} />
        </div>
        <p className="text-body text-fg-secondary">
          {tr("platform.aiProviderLine", {
            vendor: AI_PROVIDER.vendor,
            model: aiSettings?.model ?? tr("platform.aiModelNotConfigured"),
            compat: AI_PROVIDER.compat,
            resetDate: resetAt.toISOString().slice(0, 10),
            costNote: tr("platform.aiCostNote"),
          })}
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {capabilityRows.length > 0 ? (
            capabilityRows.map((row) => {
              const meta = getAiCapabilityMetadata(row.capability);
              return (
                <div
                  key={row.capability}
                  className="border-border flex items-center justify-between rounded-[var(--radius-control)] border px-3 py-2"
                >
                  <span className="text-label text-fg-secondary">
                    {meta?.label ?? capabilityLabel(row.capability, tr)}
                  </span>
                  <span className="text-body text-fg-primary font-semibold">{row.requests}</span>
                </div>
              );
            })
          ) : (
            <p className="text-body text-fg-muted">{tr("platform.aiEmptyMonth")}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {[...effective.enabledAiCapabilities].map((capability) => (
            <Badge
              key={capability}
              variant={enabledCapabilities.includes(capability) ? "success" : "outline"}
            >
              {capabilityLabel(capability, tr)}
            </Badge>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface-subtle rounded-[var(--radius-control)] p-3">
      <p className="text-label text-fg-muted">{label}</p>
      <p className="text-title-card text-fg-primary font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function LimitInput({
  label,
  field,
  socialPlatform,
  value,
}: {
  label: string;
  field?: string;
  socialPlatform?: string;
  value: number | null | undefined;
}) {
  const name = socialPlatform ? `override_social_${socialPlatform}` : `override_${field}`;
  return (
    <label className="text-label text-fg-secondary grid gap-1 capitalize">
      {label}
      <input
        name={name}
        type="number"
        min={0}
        step={1}
        defaultValue={value ?? ""}
        className="border-border bg-surface text-body rounded-[var(--radius-control)] border px-3 py-2"
      />
    </label>
  );
}
