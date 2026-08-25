import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot, KeyRound, Server } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { serverEnv } from "@/lib/validation/env";
import { PageHeader } from "@/components/workspace/page-header";
import { AiSettingsForm } from "./ai-settings-form";
import { ManagedSecretForm } from "./managed-secret-form";
import { getAiFeatureSettings, getMonthlyUsage } from "@/lib/ai/feature-settings";
import { getManagedSecretStatus } from "@/lib/ai/provider-secret";
import { getKekStatus } from "@/lib/security/secrets";

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
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
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

  return (
    <div className="space-y-6" data-testid="agency-ai-settings">
      <PageHeader
        eyebrow="Agency Settings"
        title="AI configuration"
        description={
          <>
            Control MiniMax access, capability toggles, and usage visibility for every workspace in
            this agency.
          </>
        }
        action={
          <Link
            href="/app/agency-settings"
            className="text-primary focus-visible:ring-focus-ring text-body inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
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
          The current provider base is{" "}
          <span className="font-semibold">{serverEnv.MINIMAX_BASE_URL}</span>. Change it via the
          deployment environment (<code>MINIMAX_BASE_URL</code>).
        </p>
      </div>

      <AiSettingsForm
        initialEnabled={feature?.enabled ?? true}
        initialModel={feature?.model ?? envModel}
        initialCapabilities={[...(feature?.enabledCapabilities ?? [])]}
        envEnabled={envEnabled}
        envModel={envModel}
        envHasKey={envHasKey}
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
          <code className="bg-surface text-label ml-1 rounded px-1.5 py-0.5 font-semibold">
            /w/&lt;slug&gt;/ai-settings
          </code>
          — they can&apos;t change anything here, only see what the agency has configured.
        </p>
      </div>
    </div>
  );
}
