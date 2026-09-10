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
  const envModel = serverEnv.MINIMAX_MODEL || "MiniMax-M3";
  const envHasKey = !!serverEnv.MINIMAX_API_KEY;
  const hasManagedSecret = secretStatus.keySource === "managed_secret";
  const providerKeyAvailable = envHasKey || hasManagedSecret;
  const anyCapabilityOn = (feature?.enabledCapabilities ?? []).length > 0;
  const effectiveLive = providerKeyAvailable && (feature?.enabled ?? false) && anyCapabilityOn;

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
        enabled={secretStatus.keySource === "missing" ? false : secretStatus.enabled}
        envHasKey={envHasKey}
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

      <AiSettingsForm
        initialEnabled={feature?.enabled ?? false}
        initialModel={feature?.model ?? envModel}
        initialCapabilities={[...(feature?.enabledCapabilities ?? [])]}
        envConfigured={envHasKey}
        envModel={envModel}
        envHasKey={envHasKey}
        providerKeyAvailable={providerKeyAvailable}
        lastTestAt={
          feature?.lastConnectionTestAt ? feature.lastConnectionTestAt.toISOString() : null
        }
        lastTestOk={feature?.lastConnectionTestOk ?? null}
        usage={usage}
      />

      <AiDiagnosticPanel
        envHasKey={envHasKey}
        hasManagedSecret={hasManagedSecret}
        managedSecretSuffix={secretStatus.keySource === "missing" ? null : secretStatus.lastFour}
        masterSwitch={feature?.enabled ?? false}
        anyCapabilityOn={anyCapabilityOn}
        effectiveLive={effectiveLive}
        aiEntryHref="/app"
        t={t}
      />

      <div className="border-border bg-surface-subtle text-body text-fg-secondary flex flex-wrap items-start gap-2 rounded-[var(--radius-control)] border p-3">
        <Bot className="text-fg-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{t("agencyAi.workspaceManagerBlurb")}</p>
      </div>
    </div>
  );
}
