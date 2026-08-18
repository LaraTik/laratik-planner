import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { activeAgencyId, isAgencyAdmin } from "@/lib/auth/policy";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/feedback/empty-state";
import { Settings } from "lucide-react";

/**
 * Agency Settings (admin only). Stubbed for Goal 3; Goal 4 + 13 add
 * name/slug, default reviewer IDs, AI feature toggle, Sentry DSN, etc.
 */
export const metadata = { title: "Agency Settings" };

export default async function AgencySettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const agencyId = await activeAgencyId();
  if (!agencyId) redirect("/setup");
  if (!(await isAgencyAdmin({ id: session.user.id }, agencyId))) {
    return (
      <div className="space-y-4">
        <h1 className="text-title-page text-fg-primary font-semibold">Forbidden</h1>
        <p className="text-body text-fg-secondary">
          Only agency admins can change agency settings.
        </p>
        <Link href="/app" className="text-primary underline-offset-4 hover:underline">
          ← Back to My Work
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-title-page text-fg-primary font-semibold">Agency Settings</h1>
        <p className="text-body text-fg-secondary mt-1">
          Name, slug, default reviewers per workspace, AI feature toggle.
        </p>
      </header>
      <EmptyState
        icon={<Settings className="h-8 w-8" aria-hidden="true" />}
        title="Agency Settings lands in Goal 4"
        description="The editable surface is in Goal 4 + the observability/security tabs in Goal 13."
      />
    </div>
  );
}
