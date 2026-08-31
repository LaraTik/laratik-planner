import { redirect } from "next/navigation";
import Link from "next/link";
import { Activity } from "lucide-react";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { PageHeader } from "@/components/workspace/page-header";
import { getSocialStatus, SocialServiceError } from "@/lib/social/service";
import { SocialCard } from "./social-card";

export const metadata = { title: "Social analytics" };

/**
 * M4.5 — agency admin social analytics page.
 *
 * Renders the social-card on top of the standard agency-settings
 * chrome. The card is a client component because the enable /
 * rotate / disable / reset-recovery flows are interactive
 * (recovery-key modal, destructive confirm, copy-to-clipboard).
 *
 * The non-admin / non-signed-in paths redirect to /signin.
 * Forbidden (signed in, not admin) shows a friendly page with
 * a back link to /app.
 */
export default async function AgencySocialSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) redirect("/setup");
  if (!(await isAgencyAdmin(actor, agencyId))) {
    return (
      <div className="space-y-4" data-testid="agency-social-forbidden">
        <PageHeader
          title="Social analytics"
          description="Only agency admins can change social analytics settings."
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

  let status;
  try {
    status = await getSocialStatus(actor, agencyId);
  } catch (err) {
    if (err instanceof SocialServiceError && err.code === "social.forbidden") {
      return (
        <div className="space-y-4" data-testid="agency-social-forbidden">
          <PageHeader
            title="Social analytics"
            description="Only agency admins can change social analytics settings."
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
    throw err;
  }

  return (
    <div className="space-y-6" data-testid="agency-social-settings">
      <PageHeader
        eyebrow="Agency Settings"
        title="Social analytics"
        description={
          <>
            Connect Meta (Facebook / Instagram) and TikTok to track follower counts, reach, and
            engagement for every channel in this agency. Tokens are encrypted at rest with a
            per-agency key.
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

      <SocialCard
        agencyId={agencyId}
        initialStatus={{
          enabled: status.enabled,
          dekKeyVersion: status.enabled ? status.dekKeyVersion : undefined,
          enabledAt: status.enabled ? status.enabledAt.toISOString() : undefined,
          lastRotatedAt: status.enabled ? (status.lastRotatedAt?.toISOString() ?? null) : undefined,
          rotationReason: status.enabled ? status.rotationReason : undefined,
          connectionCount: status.connectionCount,
          platformKekAvailable: status.platformKekAvailable,
        }}
      />

      <div className="border-border bg-surface-subtle text-body text-fg-secondary flex flex-wrap items-start gap-2 rounded-[var(--radius-control)] border p-3">
        <Activity className="text-fg-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p>
            The agency DEK is wrapped by the platform KEK (<code>SOCIAL_TOKEN_ENCRYPTION_KEY</code>)
            and stored in
            <code> agency_social_dek</code>. The plaintext DEK is shown to the agency admin exactly
            once at enable / rotate time and is never persisted or logged.
          </p>
          <p className="mt-2">
            If the platform operator rotates the KEK, run{" "}
            <code className="bg-surface rounded px-1.5 py-0.5">
              pnpm tsx scripts/rotate-social-kek.ts --new-kek &quot;$(openssl rand -base64 32)&quot;
            </code>{" "}
            to re-wrap every agency DEK.
          </p>
        </div>
      </div>
    </div>
  );
}
