import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
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
import { changeLifecycleAction, changePlanAction } from "../actions";

export async function PlanAiSections({ agencyId }: { agencyId: string }) {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const resetAt = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const [agency, entitlement, plans, aiSettings, aiRows, capabilityRows, usage, effective] = await Promise.all([
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
      .innerJoin(platformPlanTemplates, eq(platformPlanTemplates.id, agencyEntitlements.planTemplateId))
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
  const lifecycle = agency.archivedAt ? "Archived" : agency.suspendedAt ? "Suspended" : "Active";
  const overrides = OverrideShapeSchema.parse(entitlement.overrides ?? {});

  return (
    <div className="space-y-5">
      <Card id="plan" padding="lg" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><CardTitle>Plan and lifecycle</CardTitle><CardDescription>Platform-owned limits. Plan changes never delete existing tenant data.</CardDescription></div>
          <Badge variant={lifecycle === "Active" ? "success" : "warning"}>{lifecycle}</Badge>
        </div>
        <form action={changePlanAction} className="grid gap-4">
          <input type="hidden" name="agencyId" value={agencyId} />
          <input type="hidden" name="overrideForm" value="1" />
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <select aria-label="Plan template" name="planTemplateId" defaultValue={entitlement.planTemplateId} className="border-border bg-surface rounded-[var(--radius-control)] border px-3 py-2">
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
            <input aria-label="Reason for plan change" name="reason" required minLength={3} placeholder="Reason for plan change" className="border-border bg-surface rounded-[var(--radius-control)] border px-3 py-2" />
            <Button type="submit">Save plan</Button>
          </div>
          <details className="border-border rounded-[var(--radius-control)] border p-4">
            <summary className="text-body text-fg-primary cursor-pointer font-semibold">Agency-specific overrides</summary>
            <p className="text-label text-fg-muted mt-2">Leave a value blank to inherit the selected plan. Saving replaces the previous override set.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <LimitInput label="Workspaces" field="workspaces" value={overrides.workspaces} />
              <LimitInput label="Users" field="users" value={overrides.users} />
              <LimitInput label="Social profiles total" field="total_social_profiles" value={overrides.total_social_profiles} />
              <LimitInput label="Storage bytes" field="storage_bytes" value={overrides.storage_bytes} />
              <LimitInput label="AI requests / month" field="monthly_ai_requests" value={overrides.monthly_ai_requests} />
              <LimitInput label="AI input tokens / month" field="monthly_ai_input_tokens" value={overrides.monthly_ai_input_tokens} />
              <LimitInput label="AI output tokens / month" field="monthly_ai_output_tokens" value={overrides.monthly_ai_output_tokens} />
              <LimitInput label="AI requests / user / day" field="daily_ai_requests_per_user" value={overrides.daily_ai_requests_per_user} />
              <LimitInput label="Output tokens / request" field="max_output_tokens_per_request" value={overrides.max_output_tokens_per_request} />
            </div>
            <fieldset className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <legend className="text-label text-fg-secondary mb-2 font-semibold">Social profiles by network</legend>
              {ALL_PLATFORM_KEYS.map((platform) => <LimitInput key={platform} label={platform} socialPlatform={platform} value={overrides.social_profiles_by_platform?.[platform]} />)}
            </fieldset>
            <fieldset className="mt-4 flex flex-wrap gap-3">
              <legend className="text-label text-fg-secondary mb-2 font-semibold">AI capability ceiling</legend>
              {ALL_AI_CAPABILITIES.map((capability) => (
                <label key={capability} className="text-label text-fg-secondary inline-flex items-center gap-2">
                  <input type="checkbox" name="override_enabled_capabilities" value={capability} defaultChecked={overrides.enabled_capabilities?.includes(capability) ?? effective.enabledAiCapabilities.has(capability)} />
                  {capability.replaceAll("_", " ")}
                </label>
              ))}
            </fieldset>
          </details>
        </form>
        <div className="grid gap-3 sm:grid-cols-3">
          {(["suspend", "restore", "archive"] as const).map((action) => (
            <form key={action} action={changeLifecycleAction} className="border-border grid gap-2 rounded-[var(--radius-control)] border p-3">
              <input type="hidden" name="agencyId" value={agencyId} />
              <input type="hidden" name="action" value={action} />
              <input name="reason" required minLength={3} placeholder={`Reason to ${action}`} className="border-border bg-surface rounded-[var(--radius-control)] border px-3 py-2" />
              <Button type="submit" variant={action === "archive" ? "destructive" : "outline"}>{action.charAt(0).toUpperCase() + action.slice(1)}</Button>
            </form>
          ))}
        </div>
      </Card>

      <Card id="usage" padding="lg" className="space-y-4">
        <div><CardTitle>Current usage</CardTitle><CardDescription>Healthy, warning, urgent, and over-limit states are calculated from live counters.</CardDescription></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(usage.thresholds).map(([resource, snapshot]) => (
            <div key={resource} className="border-border rounded-[var(--radius-control)] border p-3">
              <p className="text-label text-fg-muted">{resource.replaceAll("_", " ")}</p>
              <p className="text-title-card text-fg-primary font-semibold">{usage.counters[resource] ?? 0} / {snapshot.limit ?? "∞"}</p>
              <Badge variant={snapshot.level === "healthy" ? "success" : snapshot.level === "over_limit" ? "danger" : "warning"}>{snapshot.level.replaceAll("_", " ")}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card id="ai" padding="lg" className="space-y-4">
        <div><CardTitle>AI usage and controls</CardTitle><CardDescription>Monthly usage, provider status, and the plan ceiling ∩ agency capability selection.</CardDescription></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Requests this month" value={ai.requests} />
          <Metric label="Input tokens" value={ai.inputTokens} />
          <Metric label="Output tokens" value={ai.outputTokens} />
        </div>
        <p className="text-body text-fg-secondary">Model: {aiSettings?.model ?? "Not configured"} · reset: {resetAt.toISOString().slice(0, 10)} UTC · estimated cost: unavailable until provider pricing is configured.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {capabilityRows.length > 0 ? capabilityRows.map((row) => (
            <div key={row.capability} className="border-border flex items-center justify-between rounded-[var(--radius-control)] border px-3 py-2">
              <span className="text-label text-fg-secondary">{row.capability.replaceAll("_", " ")}</span>
              <span className="text-body text-fg-primary font-semibold">{row.requests}</span>
            </div>
          )) : <p className="text-body text-fg-muted">No AI requests this month.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {[...effective.enabledAiCapabilities].map((capability) => <Badge key={capability} variant={enabledCapabilities.includes(capability) ? "success" : "outline"}>{capability.replaceAll("_", " ")}</Badge>)}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="bg-surface-subtle rounded-[var(--radius-control)] p-3"><p className="text-label text-fg-muted">{label}</p><p className="text-title-card text-fg-primary font-semibold">{value.toLocaleString()}</p></div>;
}

function LimitInput({ label, field, socialPlatform, value }: { label: string; field?: string; socialPlatform?: string; value: number | null | undefined }) {
  const name = socialPlatform ? `override_social_${socialPlatform}` : `override_${field}`;
  return <label className="text-label text-fg-secondary grid gap-1 capitalize">{label.replaceAll("_", " ")}<input name={name} type="number" min={0} step={1} defaultValue={value ?? ""} className="border-border bg-surface text-body rounded-[var(--radius-control)] border px-3 py-2" /></label>;
}
