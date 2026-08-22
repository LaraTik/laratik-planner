import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { firstAgencyForBootstrap } from "@/lib/auth/policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";

/**
 * First-time agency administrator setup.
 *
 * Per master prompt §13: "One-time first-agency-administrator setup when
 * no administrator exists." After this flow completes, the user is the
 * admin and the bootstrap token becomes operationally irrelevant.
 */
export const metadata = { title: "Bootstrap the agency" };

export default async function SetupPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin?callbackUrl=/setup");
  }

  // If an agency already exists, this user is not the first admin
  // (we don't reveal whether THEY are the admin — they should check /app)
  const agencyId = await firstAgencyForBootstrap();
  if (agencyId) {
    redirect("/app");
  }

  return (
    <main
      className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 py-16"
      data-testid="setup-page"
    >
      <header className="flex flex-col items-center gap-2 text-center">
        <p className="border-border bg-surface text-label text-fg-muted rounded-full border px-3 py-1">
          First-time setup
        </p>
        <h1 className="text-title-page text-fg-primary font-semibold tracking-tight">
          Bootstrap the agency
        </h1>
        <p className="text-body text-fg-secondary max-w-sm">
          You&apos;re the first user of this deployment. Create the agency and become its
          administrator. This action is one-time.
        </p>
      </header>

      <form action="/api/bootstrap/admin" method="POST" className="w-full space-y-4">
        <FormField
          id="agencyName"
          label="Agency name"
          hint="The name your clients and team will see."
          required
        >
          <Input
            type="text"
            name="agencyName"
            required
            minLength={2}
            maxLength={100}
            placeholder="Acme Social"
          />
        </FormField>
        <FormField
          id="agencySlug"
          label="Agency slug"
          hint="Lowercase letters, digits, and hyphens. Used in URLs."
          required
        >
          <Input
            type="text"
            name="agencySlug"
            required
            minLength={2}
            maxLength={60}
            pattern="^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$"
            placeholder="acme"
          />
        </FormField>
        <FormField
          id="token"
          label="Bootstrap token"
          hint="From the BOOTSTRAP_SETUP_TOKEN env var on the server."
          required
        >
          <Input type="password" name="token" required minLength={1} autoComplete="off" />
        </FormField>
        <Button type="submit" className="w-full" size="lg">
          Create the agency
        </Button>
      </form>

      <p className="text-label text-fg-muted text-center">
        Signed in as <span className="text-fg-primary font-semibold">{session.user.email}</span>.{" "}
        <Link
          href="/api/auth/signout"
          className="text-primary focus-visible:ring-focus-ring rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
        >
          Sign out
        </Link>
      </p>
    </main>
  );
}
