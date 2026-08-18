import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { activeAgencyId, isAgencyAdmin } from "@/lib/auth/policy";
import { AppShell } from "@/components/app-shell/app-shell";

/**
 * Authenticated app shell — wraps every page under (app)/*.
 *
 * Gates:
 *  1. Not signed in → /signin
 *  2. Signed in but no agency configured → /setup
 *  3. Signed in + agency, but no workspace membership → /app/workspaces/new
 *     (or /app for admins who can create the first workspace)
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const agencyId = await activeAgencyId();
  if (!agencyId) {
    redirect("/setup");
  }

  const isAdmin = await isAgencyAdmin({ id: session.user.id }, agencyId);

  return (
    <AppShell
      user={{
        id: session.user.id,
        name: session.user.name ?? session.user.email ?? "User",
        email: session.user.email ?? "",
        image: session.user.image ?? null,
        isAdmin,
      }}
    >
      {children}
    </AppShell>
  );
}
