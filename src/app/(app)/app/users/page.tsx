import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { activeAgencyId, isAgencyAdmin } from "@/lib/auth/policy";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/feedback/empty-state";
import { Users } from "lucide-react";

/**
 * User Management (admin only). Stubbed for Goal 3; Goal 4 wires
 * invitations, role management, and deactivation.
 */
export const metadata = { title: "User Management" };

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const agencyId = await activeAgencyId();
  if (!agencyId) redirect("/setup");
  if (!(await isAgencyAdmin({ id: session.user.id }, agencyId))) {
    return (
      <div className="space-y-4">
        <h1 className="text-title-page text-fg-primary font-semibold">Forbidden</h1>
        <p className="text-body text-fg-secondary">Only agency admins can manage users.</p>
        <Link href="/app" className="text-primary underline-offset-4 hover:underline">
          ← Back to My Work
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-title-page text-fg-primary font-semibold">User Management</h1>
        <p className="text-body text-fg-secondary mt-1">
          Invite team members, assign workspace roles, deactivate departures.
        </p>
      </header>
      <EmptyState
        icon={<Users className="h-8 w-8" aria-hidden="true" />}
        title="User management lands in Goal 4"
        description="Invitation flow, role assignment per workspace, deactivation, and per-user activity. Coming next."
      />
    </div>
  );
}
