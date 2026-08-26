import { redirect, notFound } from "next/navigation";
import { and, count, eq, gte } from "drizzle-orm";
import Link from "next/link";
import { ArrowUpRight, Bot, Clock, ShieldCheck, Sparkles } from "lucide-react";
import { hasWorkspaceRole, isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { db } from "@/lib/db";
import { aiFeatureSettings, aiUsageEvents } from "@/lib/db/schema";
import { serverEnv } from "@/lib/validation/env";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { humanize } from "@/lib/content/status";

export const metadata = { title: "AI settings" };

/**
 * Workspace AI settings — READ-ONLY status card.
 *
 * Per STUDIOFLOW_MASTER_PROMPT.md §15, AI configuration is
 * agency-level (`ai_feature_setting.agency_id` PK). This page shows
 * the workspace-relevant slice:
 *   - whether AI is enabled for the agency
 *   - which capabilities are turned on
 *   - 30-day request volume for THIS workspace
 *   - the safety boundary
 *
 * The editable surface lives at `/app/agency-settings/ai` for admins.
 * Workspace managers and planners can read this card and see the link.
 */
const ALL_CAPABILITIES = [
  {
    id: "campaign_ideas",
    label: "Campaign ideas",
    description: "Generate content ideas tied to the active campaign and pillars.",
  },
  {
    id: "brief_improvement",
    label: "Brief improvement",
    description: "Tighten a vague brief into a clear Hook → Main message → CTA structure.",
  },
  {
    id: "caption_drafts",
    label: "Caption / hook / CTA drafts",
    description: "Draft a caption with platform-aware tone; editable before save.",
  },
  {
    id: "platform_adaptation",
    label: "Platform adaptation",
    description: "Adapt a caption to a different channel (Instagram, TikTok, LinkedIn, …).",
  },
  {
    id: "related_format_ideas",
    label: "Related format ideas",
    description: "Suggest adjacent formats for a piece of content (carousel ↔ reel ↔ story).",
  },
  {
    id: "completeness_check",
    label: "Brief completeness check",
    description: "Score how ready a brief is for creative handoff and flag the missing pieces.",
  },
] as const;

export default async function AiSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const workspace = await getAccessibleWorkspace(actor, slug);
  if (!workspace) notFound();
  if (!(await hasWorkspaceRole(actor, workspace.id, ["workspace_manager"]))) notFound();

  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) notFound();

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);

  const [[feature], [usage], admin] = await Promise.all([
    db.select().from(aiFeatureSettings).where(eq(aiFeatureSettings.agencyId, agencyId)).limit(1),
    db
      .select({ value: count() })
      .from(aiUsageEvents)
      .where(and(eq(aiUsageEvents.workspaceId, workspace.id), gte(aiUsageEvents.createdAt, since))),
    isAgencyAdmin(actor, agencyId),
  ]);

  // M3.4 — the workspace status card reflects the effective runtime
  // state, which counts a managed secret as a key source. The
  // backend (`/api/ai/generate`, `testAiConnection`, `chat`) allows
  // a managed secret to bypass `AI_FEATURE_ENABLED`, so the UI
  // gate must match: any working key source + the agency's
  // master switch = the workspace is live. `AI_FEATURE_ENABLED`
  // only matters for the env path (no key at all).
  const hasManagedSecret = feature?.keySource === "managed_secret" && !!feature.maskedKeySuffix;
  const hasAnyKey = !!serverEnv.MINIMAX_API_KEY || hasManagedSecret;
  const effectiveEnabled = hasAnyKey && (feature?.enabled ?? true);
  const enabledCapabilities = new Set(feature?.enabledCapabilities ?? []);
  const requestCount = usage?.value ?? 0;

  return (
    <div className="space-y-6" data-testid="workspace-ai-settings">
      <PageHeader
        eyebrow={workspace.name}
        title="AI assistance"
        description={
          <>
            Environment-managed assistance with human-controlled insert and replace.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
        action={
          admin ? (
            <Link
              href="/app/agency-settings/ai"
              className="text-primary focus-visible:ring-focus-ring text-body inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              data-testid="ai-open-agency-config"
            >
              Configure at agency level
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="ai-status-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bot className="text-primary h-5 w-5" aria-hidden="true" />
              <CardTitle>Provider</CardTitle>
            </div>
            <Badge variant={effectiveEnabled ? "success" : "outline"}>
              {effectiveEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
          <CardDescription className="mt-2">
            AI is configured at the agency level. Workspace managers cannot change provider, model,
            or capability toggles — only agency admins can.
          </CardDescription>
          <dl className="mt-5 space-y-3">
            <Row
              label="Provider"
              value={effectiveEnabled ? "MiniMax (Anthropic-compatible)" : "Not configured"}
            />
            <Row label="Model" value={serverEnv.MINIMAX_MODEL || "default"} />
            <Row
              label="Key source"
              value={
                feature?.keySource === "managed_secret" && feature.maskedKeySuffix
                  ? `Managed secret · ends in …${feature.maskedKeySuffix}`
                  : "Configured by environment"
              }
            />
            <Row label="Requests in this workspace, last 30 days" value={String(requestCount)} />
          </dl>
        </Card>

        <Card data-testid="ai-capabilities-card">
          <div className="flex items-center gap-2">
            <Sparkles className="text-primary h-5 w-5" aria-hidden="true" />
            <CardTitle>Available capabilities</CardTitle>
          </div>
          <CardDescription className="mt-2">
            Each capability surfaces a button in the planning flow. Disabled capabilities stay
            hidden in the UI.
          </CardDescription>
          <ul className="mt-4 space-y-2" data-testid="ai-capability-list">
            {ALL_CAPABILITIES.map((cap) => {
              const isOn = effectiveEnabled && enabledCapabilities.has(cap.id);
              return (
                <li
                  key={cap.id}
                  className="border-border bg-surface-subtle flex flex-wrap items-start justify-between gap-2 rounded-[var(--radius-control)] border p-3"
                  data-testid={`ai-capability-${cap.id}`}
                >
                  <div className="min-w-0">
                    <p className="text-body text-fg-primary font-semibold">{cap.label}</p>
                    <p className="text-label text-fg-muted mt-0.5">{cap.description}</p>
                  </div>
                  <Badge variant={isOn ? "success" : "outline"}>{isOn ? "On" : "Off"}</Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card data-testid="ai-safety-card">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-success h-5 w-5" aria-hidden="true" />
          <CardTitle>Safety boundary</CardTitle>
        </div>
        <ul className="text-body text-fg-secondary mt-4 grid gap-2 sm:grid-cols-2">
          <li>· AI drafts text; the human inserts or replaces — never auto-saves.</li>
          <li>· Only allowlisted content fields are sent to the provider.</li>
          <li>· Usage logs record categories and token counts, never full prompts.</li>
          <li>· Rate limits protect users and provider spend; one retry on transient errors.</li>
        </ul>
        <p className="text-label text-fg-muted mt-4">
          Status flag value:{" "}
          <span className="font-semibold">{humanize(feature?.keySource ?? "environment")}</span>
        </p>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <dt className="text-body text-fg-secondary">{label}</dt>
      <dd className="text-body text-right font-semibold">{value}</dd>
    </div>
  );
}
