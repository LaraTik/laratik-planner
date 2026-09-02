import Link from "next/link";
import { AlertTriangle, Lock } from "lucide-react";
import { tForActive } from "@/lib/i18n/t-for-active";

/**
 * M3.5 — Persistent support-session banner.
 *
 * Per master prompt §4 (Milestone 3): "Platform administrators
 * must see a persistent support-session banner."
 *
 * The banner is rendered at the top of every (app)/* page when
 * the calling platform administrator holds at least one
 * un-revoked, un-expired support access grant. The banner:
 *   1. Names the target agency and the remaining duration.
 *   2. Links to the security console for revocation / history.
 *   3. Disappears the moment the actor revokes or the grant
 *      expires (the parent layout re-queries on every request).
 *
 * The banner is intentionally low-amplitude (no animation, no
 * dismiss) — it is a persistent audit-trail cue for the actor
 * themselves. Hiding it would defeat the purpose.
 *
 * The component is a server component: the parent layout
 * passes both the grant list and the pre-computed remaining
 * time. The component itself does no time arithmetic to keep
 * the React purity rule clean.
 */
export interface SupportSessionGrant {
  id: string;
  targetAgencyId: string;
  scopeWorkspaceId: string | null;
  scopeMetadataOnly: boolean;
  downloadsAllowed: boolean;
  activatedAt: string;
  expiresAt: string;
  /**
   * Pre-computed remaining minutes; computed by the server
   * layout (where Date.now() is allowed).
   */
  remainingMinutes: number;
}

export async function SupportSessionBanner({ grants }: { grants: SupportSessionGrant[] }) {
  if (grants.length === 0) return null;
  const first = grants[0];
  if (!first) return null;
  const { t } = await tForActive();
  const hoursRemaining = Math.floor(first.remainingMinutes / 60);
  const minutesRemaining = first.remainingMinutes % 60;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="support-session-banner"
      data-grant-id={first.id}
      data-remaining-minutes={first.remainingMinutes}
      className="bg-warning-container text-on-warning-container border-warning mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border px-4 py-3"
    >
      <div className="flex items-center gap-2 text-sm">
        <Lock className="h-4 w-4" aria-hidden="true" />
        <span className="font-semibold">{t("common.supportSession.active")}</span>
        <span className="text-on-warning-container/80">
          {grants.length === 1
            ? t("common.supportSession.viewingAgency", {
                agency: `${first.targetAgencyId.slice(0, 8)}…`,
              })
            : t("common.supportSession.activeMany", { count: grants.length })}
          {" · "}
          {hoursRemaining > 0
            ? t("common.supportSession.expiresHours", {
                hours: hoursRemaining,
                minutes: minutesRemaining,
              })
            : t("common.supportSession.expiresMinutes", { minutes: minutesRemaining })}
          {" · "}
          {first.scopeMetadataOnly
            ? t("common.supportSession.metadataOnly")
            : first.downloadsAllowed
              ? t("common.supportSession.downloadsAllowed")
              : t("common.supportSession.downloadsOff")}
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <span className="text-on-warning-container/80">
          {t("common.supportSession.auditNotice")}
        </span>
        <Link
          href="/app/platform/security"
          className="focus-visible:ring-focus-ring rounded-[var(--radius-control)] px-2 py-1 font-semibold underline underline-offset-4 focus:outline-none focus-visible:ring-2"
          data-testid="support-session-banner-link"
        >
          {t("common.supportSession.manage")}
        </Link>
      </div>
    </div>
  );
}
