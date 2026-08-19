import { auth, signOut } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { agencyMemberships, agencies, workspaces, workspaceMemberships } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogOut, Mail, User as UserIcon } from "lucide-react";

/**
 * Account page — own profile, agency + workspaces membership, sign out.
 *
 * Read-only today. "Edit display name" / "change email" are a Goal 11+
 * follow-up. Sign out is the only mutation.
 */
export const metadata = { title: "Account" };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) return null;

  // Look up the user's agency + workspace count via a single round-trip.
  // Falls back gracefully if the user is not yet a member of any agency
  // (first sign-in, pre-bootstrap).
  const [profile] = await db
    .select({
      userId: agencyMemberships.userId,
      agencyId: agencies.id,
      agencyName: agencies.name,
      isAgencyAdmin: agencyMemberships.isAgencyAdmin,
      membershipStatus: agencyMemberships.status,
      workspaceCount: sql<number>`(
        SELECT COUNT(*)::int
        FROM ${workspaceMemberships} wm
        WHERE wm.user_id = ${agencyMemberships.userId}
          AND wm.status = 'active'
      )`,
    })
    .from(agencyMemberships)
    .innerJoin(agencies, eq(agencies.id, agencyMemberships.agencyId))
    .where(
      and(
        eq(agencyMemberships.userId, session.user.id),
        eq(agencyMemberships.status, "active"),
      ),
    )
    .limit(1);

  // Fallback: list workspaces directly the user is a member of, in case
  // the agency join failed for some reason.
  const myWorkspaces = await db
    .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(
      and(
        eq(workspaceMemberships.userId, session.user.id),
        eq(workspaceMemberships.status, "active"),
      ),
    )
    .limit(20);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-title-page text-fg-primary font-semibold">Account</h1>
        <p className="text-body text-fg-secondary mt-1">
          Your profile, agency membership, and sign-in options.
        </p>
      </header>

      <section
        aria-labelledby="profile-heading"
        className="border-border bg-surface rounded-[var(--radius-card)] border p-5"
      >
        <h2
          id="profile-heading"
          className="text-title-card text-fg-primary flex items-center gap-2 font-semibold"
        >
          <UserIcon className="h-4 w-4" aria-hidden="true" />
          Profile
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr]">
          <dt className="text-body text-fg-muted">Name</dt>
          <dd className="text-body text-fg-primary font-semibold">{session.user.name}</dd>
          <dt className="text-body text-fg-muted">Email</dt>
          <dd className="text-body text-fg-primary flex items-center gap-2 font-semibold">
            <Mail className="text-fg-muted h-3.5 w-3.5" aria-hidden="true" />
            {session.user.email}
          </dd>
          <dt className="text-body text-fg-muted">Role</dt>
          <dd>
            <Badge variant={session.user.role === "agency_admin" ? "primary" : "default"}>
              {session.user.role === "agency_admin" ? "Agency admin" : "Member"}
            </Badge>
          </dd>
        </dl>
      </section>

      <section
        aria-labelledby="agency-heading"
        className="border-border bg-surface rounded-[var(--radius-card)] border p-5"
      >
        <h2
          id="agency-heading"
          className="text-title-card text-fg-primary font-semibold"
        >
          Agency
        </h2>
        {profile ? (
          <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr]">
            <dt className="text-body text-fg-muted">Name</dt>
            <dd className="text-body text-fg-primary font-semibold">{profile.agencyName}</dd>
            <dt className="text-body text-fg-muted">Admin</dt>
            <dd>
              <Badge variant={profile.isAgencyAdmin ? "success" : "default"}>
                {profile.isAgencyAdmin ? "Yes" : "No"}
              </Badge>
            </dd>
            <dt className="text-body text-fg-muted">Workspaces</dt>
            <dd className="text-body text-fg-primary font-semibold">
              {myWorkspaces.length}
              {myWorkspaces.length > 0 ? (
                <span className="text-label text-fg-muted ml-2">
                  ({myWorkspaces.map((w) => w.name).join(", ")})
                </span>
              ) : null}
            </dd>
          </dl>
        ) : (
          <p className="text-body text-fg-muted mt-2">
            You&apos;re not yet a member of any agency. If this is your first sign-in, the
            bootstrap flow will assign you as the agency admin on the next page load.
          </p>
        )}
      </section>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin" });
        }}
      >
        <Button type="submit" variant="destructive">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </Button>
      </form>
    </div>
  );
}
