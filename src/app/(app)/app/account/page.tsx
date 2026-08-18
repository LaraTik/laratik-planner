import { auth, signOut } from "@/lib/auth/config";
import { Button } from "@/components/ui/button";

/**
 * Account page — own profile, sign out.
 */
export const metadata = { title: "Account" };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-title-page text-fg-primary font-semibold">Account</h1>
        <p className="text-body text-fg-secondary mt-1">Your profile and sign-in options.</p>
      </header>

      <section className="border-border bg-surface rounded-[var(--radius-card)] border p-5">
        <h2 className="text-title-card text-fg-primary font-semibold">Profile</h2>
        <dl className="text-body mt-3 space-y-2">
          <div className="flex gap-3">
            <dt className="text-fg-muted w-24">Name</dt>
            <dd className="text-fg-primary font-semibold">{session.user.name}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-fg-muted w-24">Email</dt>
            <dd className="text-fg-primary font-semibold">{session.user.email}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-fg-muted w-24">Role</dt>
            <dd className="text-fg-primary font-semibold">{session.user.role ?? "user"}</dd>
          </div>
        </dl>
      </section>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin" });
        }}
      >
        <Button type="submit" variant="destructive">
          Sign out
        </Button>
      </form>
    </div>
  );
}
