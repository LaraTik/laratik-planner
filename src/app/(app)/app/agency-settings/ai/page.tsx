import { redirect } from "next/navigation";
import Link from "next/link";
import { Bot, KeyRound, Server } from "lucide-react";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { serverEnv } from "@/lib/validation/env";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { AiDiagnosticPanel } from "@/components/ai/ai-diagnostic-panel";
import { AiSettingsForm } from "./ai-settings-form";
import { ManagedSecretForm } from "./managed-secret-form";
import { getAiFeatureSettings, getMonthlyUsage } from "@/lib/ai/feature-settings";
import { getManagedSecretStatus } from "@/lib/ai/provider-secret";
import { getKekStatus } from "@/lib/security/secrets";
import { AI_PROVIDER } from "@/lib/ai/capabilities";

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("agencyAi.title") };
}

/**
 * Agency-level AI configuration (STUDIOFLOW_MASTER_PROMPT.md §15).
 *
 * Admin-only surface that lets an agency admin:
 *   - Toggle the master switch
 *   - Pick a model from the server allowlist
 *   - Toggle each of the 6 capabilities
 *   - Set / replace / remove a managed API key
 *   - Test the connection
 *   - See the last test result + 30-day usage
 *
 * The non-admin / non-signed-in paths redirect to /signin. Forbidden
 * (signed in, not admin) shows a friendly page with a back link.
 */
export default async function AgencyAiSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) redirect("/setup");
  const { t } = await tForActive();
  if (!(await isAgencyAdmin(actor, agencyId))) {
    return (
      <div className="space-y-4" data-testid="agency-ai-forbidden">
        <PageHeader title={t("agencyAi.title")} description={t("agencyAi.forbiddenBody")} />
        <Link
          href="/app/agency-settings"
          className="text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          <DirAwareArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("agencyAi.backToAgencySettings")}
        </Link>
      </div>
    );
  }

  const [feature, usage, secretStatus, kekStatus] = await Promise.all([
    getAiFeatureSettings(),
    getMonthlyUsage(30),
    getManagedSecretStatus(agencyId),
    getKekStatus(),
  ]);
  const envEnabled = serverEnv.AI_FEATURE_ENABLED && !!serverEnv.MINIMAX_API_KEY;
  const envModel = serverEnv.MINIMAX_MODEL || "MiniMax-M3";
  const envHasKey = !!serverEnv.MINIMAX_API_KEY;
  // The master switch + test connection should be available whenever the
  // agency has ANY working key source (M3.4 — managed secret counts).
  // The backend already allows a managed secret to bypass the env
  // kill-switch (`/api/ai/generate`, `testAiConnection`, `chat` all
  // short-circuit on "no env key AND no managed secret" rather than
  // on `AI_FEATURE_ENABLED` alone), so the form must match. Dropping
  // `serverEnv.AI_FEATURE_ENABLED` here lets an agency admin enable
  // AI from the UI on a deployment where the operator left the env
  // kill-switch off — the managed secret IS the operator's
  // permission. `envEnabled` stays env-only because it is a display
  // of the env state for the "Provider environment" badge, not a
  // gate on the feature.
  const hasManagedSecret = secretStatus.keySource === "managed_secret";
  const featureIsEnabled = envHasKey || hasManagedSecret;
  // 2026-08-27 — added the diagnostic panel so the admin can see,
  // at a glance, *which* of the 3 prerequisites is blocking AI
  // when the in-DB toggle reads "On" but the runtime is blocked.
  // `effectiveLive` is the union of all 3 prerequisites + the
  // agency master switch (the toggle in the form) + at least one
  // capability. If the user has toggled no capability on, AI is
  // technically reachable but no button renders; we still report
  // "live" so they don't get a false alarm, and the capability
  // list below is the actual surface.
  const anyCapabilityOn = (feature?.enabledCapabilities ?? []).length > 0;
  const effectiveLive = featureIsEnabled && (feature?.enabled ?? true) && anyCapabilityOn;

  return (
    <div className="space-y-6" data-testid="agency-ai-settings">
      <PageHeader
        eyebrow={t("agencyAi.eyebrow")}
        title={t("agencyAi.title")}
        description={t("agencyAi.description", { vendor: AI_PROVIDER.vendor })}
        action={
          <Link
            href="/app/agency-settings"
            className="text-primary focus-visible:ring-focus-ring text-body inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            <DirAwareArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("agencyAi.backToAgencySettings")}
          </Link>
        }
      />

      <ManagedSecretForm
        keySource={secretStatus.keySource}
        lastFour={secretStatus.keySource === "missing" ? null : secretStatus.lastFour}
        enabled={secretStatus.keySource === "missing" ? true : secretStatus.enabled}
        envHasKey={envHasKey}
        envEnabled={envEnabled}
        kekStatus={kekStatus}
      />

      <div className="border-border bg-surface-subtle text-body text-fg-secondary flex flex-wrap items-start gap-2 rounded-[var(--radius-control)] border p-3">
        <KeyRound className="text-fg-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{t("agencyAi.secretBlurb")}</p>
      </div>

      <div className="border-border bg-surface-subtle text-body text-fg-secondary flex flex-wrap items-start gap-2 rounded-[var(--radius-control)] border p-3">
        <Server className="text-fg-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          {t("agencyAi.baseBlurb", {
            vendor: AI_PROVIDER.vendor,
            base: serverEnv.MINIMAX_BASE_URL,
            compat: AI_PROVIDER.compat,
            env: AI_PROVIDER.baseUrlEnv,
          })}
        </p>
      </div>

      <AiDiagnosticPanel
        envKillSwitch={serverEnv.AI_FEATURE_ENABLED}
        envHasKey={envHasKey}
        hasManagedSecret={hasManagedSecret}
        managedSecretSuffix={secretStatus.keySource === "missing" ? null : secretStatus.lastFour}
        masterSwitch={feature?.enabled ?? true}
        anyCapabilityOn={anyCapabilityOn}
        effectiveLive={effectiveLive}
        aiEntryHref="/app"
        t={t}
      />

      <AiSettingsForm
        initialEnabled={feature?.enabled ?? true}
        initialModel={feature?.model ?? envModel}
        initialCapabilities={[...(feature?.enabledCapabilities ?? [])]}
        envEnabled={envEnabled}
        envModel={envModel}
        envHasKey={envHasKey}
        featureIsEnabled={featureIsEnabled}
        lastTestAt={
          feature?.lastConnectionTestAt ? feature.lastConnectionTestAt.toISOString() : null
        }
        lastTestOk={feature?.lastConnectionTestOk ?? null}
        usage={usage}
      />

      <div className="border-border bg-surface-subtle text-body text-fg-secondary flex flex-wrap items-start gap-2 rounded-[var(--radius-control)] border p-3">
        <Bot className="text-fg-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{t("agencyAi.workspaceManagerBlurb")}</p>
      </div>
    </div>
  );
}
