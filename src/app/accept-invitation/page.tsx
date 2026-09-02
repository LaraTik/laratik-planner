import { auth } from "@/lib/auth/config";
import { acceptInvitation } from "@/lib/auth/invitations";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { tForActive } from "@/lib/i18n/t-for-active";

/**
 * "Not you? Sign out instead" — escape hatch rendered on every
 * non-redirect state of the invitation-accept flow. If a hijacked
 * cookie lands here, the legitimate user can leave without
 * devtools. Mirrors the same escape added to /set-password
 * (15f9f6d). The proxy allowlist (src/proxy.ts) already permits
 * /signout.
 */
function SignOutLink({ label }: { label: string }) {
  return (
    <div className="mt-4">
      <Link
        href="/signout"
        className="text-fg-muted text-label hover:text-fg-secondary focus-visible:ring-focus-ring inline-block rounded-sm focus:outline-none focus-visible:ring-2"
        data-testid="accept-invitation-signout-link"
      >
        {label}
      </Link>
    </div>
  );
}

/**
 * Invitation accept page. Signed-out users get bounced through sign-in
 * (callbackUrl=/accept-invitation?token=...) and land back here.
 *
 * The page renders four states — no token, invalid, expired, success —
 * each with its own localized copy. Pluralization (one workspace vs
 * many) is handled through two adjacent catalog keys rather than
 * ICU `plural` so the hand-rolled translator keeps its narrow
 * placeholder contract.
 */
export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("auth.acceptInvitation.title") };
}

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { t } = await tForActive();
  const sp = await searchParams;
  const session = await auth();
  const token = sp.token;

  if (!token) {
    return (
      <main
        className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center"
        data-testid="accept-invitation-page"
      >
        <h1 className="text-title-page text-fg-primary font-semibold">
          {t("auth.acceptInvitation.invalidTitle")}
        </h1>
        <p className="text-body text-fg-secondary mt-2">{t("auth.acceptInvitation.invalidBody")}</p>
        <SignOutLink label={t("auth.acceptInvitation.signOut")} />
      </main>
    );
  }

  if (!session?.user?.id) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/accept-invitation?token=${token}`)}`);
  }

  const result = await acceptInvitation({ rawToken: token, userId: session.user.id });

  if (result.status === "invalid") {
    return (
      <main
        className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center"
        data-testid="accept-invitation-page"
      >
        <h1 className="text-title-page text-fg-primary font-semibold">
          {t("auth.acceptInvitation.revokedTitle")}
        </h1>
        <p className="text-body text-fg-secondary mt-2">{t("auth.acceptInvitation.revokedBody")}</p>
        <SignOutLink label={t("auth.acceptInvitation.signOut")} />
      </main>
    );
  }

  if (result.status === "expired") {
    return (
      <main className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="text-title-page text-fg-primary font-semibold">
          {t("auth.acceptInvitation.expiredTitle")}
        </h1>
        <p className="text-body text-fg-secondary mt-2">{t("auth.acceptInvitation.expiredBody")}</p>
        <SignOutLink label={t("auth.acceptInvitation.signOut")} />
      </main>
    );
  }

  // success
  const count = result.workspaceIds.length;
  const body =
    count === 0
      ? t("auth.acceptInvitation.successNoWorkspace")
      : count === 1
        ? t("auth.acceptInvitation.successOneWorkspace", { count })
        : t("auth.acceptInvitation.successManyWorkspaces", { count });
  return (
    <main className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-title-page text-fg-primary font-semibold">
        {t("auth.acceptInvitation.successTitle")}
      </h1>
      <p className="text-body text-fg-secondary mt-2">{body}</p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link href="/app">{t("auth.acceptInvitation.goToMyWork")}</Link>
        </Button>
      </div>
      <SignOutLink label={t("auth.acceptInvitation.signOut")} />
    </main>
  );
}
