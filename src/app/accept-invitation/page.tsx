import { auth } from "@/lib/auth/config";
import { acceptInvitation } from "@/lib/auth/invitations";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * "Not you? Sign out instead" — escape hatch rendered on every
 * non-redirect state of the invitation-accept flow. If a hijacked
 * cookie lands here, the legitimate user can leave without
 * devtools. Mirrors the same escape added to /set-password
 * (15f9f6d). The proxy allowlist (src/proxy.ts) already permits
 * /signout.
 */
function SignOutLink() {
  return (
    <div className="mt-4">
      <Link
        href="/signout"
        className="text-fg-muted text-label hover:text-fg-secondary focus-visible:ring-focus-ring inline-block rounded-sm focus:outline-none focus-visible:ring-2"
        data-testid="accept-invitation-signout-link"
      >
        Not you? Sign out instead
      </Link>
    </div>
  );
}

/**
 * Invitation accept page. Signed-out users get bounced through sign-in
 * (callbackUrl=/accept-invitation?token=...) and land back here.
 */
export const metadata = { title: "Accept invitation" };

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const token = sp.token;

  if (!token) {
    return (
      <main
        className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center"
        data-testid="accept-invitation-page"
      >
        <h1 className="text-title-page text-fg-primary font-semibold">Invalid invitation</h1>
        <p className="text-body text-fg-secondary mt-2">
          The link is missing the invitation token. Please check the link in your email.
        </p>
        <SignOutLink />
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
        <h1 className="text-title-page text-fg-primary font-semibold">Invalid invitation</h1>
        <p className="text-body text-fg-secondary mt-2">
          The link is invalid or has been revoked. Ask your admin to send a new one.
        </p>
        <SignOutLink />
      </main>
    );
  }

  if (result.status === "expired") {
    return (
      <main className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="text-title-page text-fg-primary font-semibold">Invitation expired</h1>
        <p className="text-body text-fg-secondary mt-2">
          The link has expired. Ask your admin to resend.
        </p>
        <SignOutLink />
      </main>
    );
  }

  // success
  return (
    <main className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-title-page text-fg-primary font-semibold">You&apos;re in</h1>
      <p className="text-body text-fg-secondary mt-2">
        {result.workspaceIds.length > 0
          ? `You've been added to ${result.workspaceIds.length} workspace${result.workspaceIds.length === 1 ? "" : "s"}.`
          : "Your agency membership is active."}
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link href="/app">Go to My Work</Link>
        </Button>
      </div>
      <SignOutLink />
    </main>
  );
}
