import { redirect } from "next/navigation";
import Link from "next/link";
import { Bot, KeyRound, Server } from "lucide-react";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { serverEnv } from "@/lib/validation/env";
import { PageHeader } from "@/components/workspace/page-header";
import { AiDiagnosticPanel } from "@/components/ai/ai-diagnostic-panel";
import { AiSettingsForm } from "./ai-settings-form";
import { ManagedSecretForm } from "./managed-secret-form";
import { getAiFeatureSettings, getMonthlyUsage } from "@/lib/ai/feature-settings";
import { getManagedSecretStatus } from "@/lib/ai/provider-secret";
import { getKekStatus } from "@/lib/security/secrets";
import { AI_PROVIDER } from "@/lib/ai/capabilities";

export const metadata = { title: "AI configuration" };

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
  if (!(await isAgencyAdmin(actor, agencyId))) {
    return (
      <div className="space-y-4" data-testid="agency-ai-forbidden">
        <PageHeader
          title="AI configuration"
          description="Only agency admins can change AI settings."
        />
        <Link
          href="/app/agency-settings"
          className="text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          <DirAwareArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Agency Settings
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
        eyebrow="Agency Settings"
        title="AI configuration"
        description={
          <>
            Control {AI_PROVIDER.vendor} access, capability toggles, and usage visibility for every
            workspace in this agency.
          </>
        }
        action={
          <Link
            href="/app/agency-settings"
            className="text-primary focus-visible:ring-focus-ring text-body inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            <DirAwareArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Agency Settings
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
        <p>
          The full API key is never displayed after the initial paste. The UI only stores a
          4-character masked suffix. Rotation is done by replacing the managed secret below.
        </p>
      </div>

      <div className="border-border bg-surface-subtle text-body text-fg-secondary flex flex-wrap items-start gap-2 rounded-[var(--radius-control)] border p-3">
        <Server className="text-fg-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          The current {AI_PROVIDER.vendor} base is{" "}
          <span className="font-semibold">{serverEnv.MINIMAX_BASE_URL}</span> ({AI_PROVIDER.compat}
          ). Change it via the deployment environment (<code>{AI_PROVIDER.baseUrlEnv}</code>).
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
        <p>
          Workspace managers see a read-only status card at
          <code className="bg-surface text-label ms-1 rounded px-1.5 py-0.5 font-semibold">
            /w/&lt;slug&gt;/ai-settings
          </code>
          — they can&apos;t change anything here, only see what the agency has configured.
        </p>
      </div>
    </div>
  );
}
