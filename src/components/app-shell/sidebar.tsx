import Link from "next/link";
import { Briefcase, Folder, Home, Settings, Shield, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Primary navigation sidebar.
 *
 * Structure (master prompt §3 "Global" + "Workspace" hierarchy):
 *  - My Work (global, shows items assigned to current user)
 *  - Workspaces (global list)
 *  - ────────── workspace-scoped (later goals) ──────────
 *  - User Management (admin only)
 *  - Agency Settings (admin only)
 */
export function Sidebar({ user }: { user: { name: string; isAdmin: boolean } }) {
  return (
    <nav className="flex h-full flex-col">
      <div className="border-border flex h-16 items-center border-b px-4">
        <Link href="/app" className="flex items-center gap-2">
          <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] text-white">
            <Briefcase className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="text-title-card text-fg-primary font-semibold">laratik-planner</span>
        </Link>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <SidebarLink href="/app" icon={<Home className="h-4 w-4" />}>
          My Work
        </SidebarLink>
        <SidebarLink href="/app/workspaces" icon={<Folder className="h-4 w-4" />}>
          Workspaces
        </SidebarLink>

        {user.isAdmin ? (
          <>
            <div className="text-label text-fg-muted px-2 pt-6 pb-2 tracking-wide uppercase">
              Admin
            </div>
            <SidebarLink href="/app/users" icon={<Users className="h-4 w-4" />}>
              User Management
            </SidebarLink>
            <SidebarLink href="/app/agency-settings" icon={<Shield className="h-4 w-4" />}>
              Agency Settings
            </SidebarLink>
          </>
        ) : null}
      </div>

      <div className="border-border border-t p-3">
        <Link
          href="/app/account"
          className="hover:bg-surface-subtle flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-2 transition"
        >
          <div className="border-border bg-surface-subtle text-label flex h-8 w-8 items-center justify-center rounded-full border font-semibold">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-body text-fg-primary truncate font-semibold">{user.name}</p>
            <Badge variant="default" className="mt-0.5">
              {user.isAdmin ? "Admin" : "Member"}
            </Badge>
          </div>
          <Settings className="text-fg-muted h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}

function SidebarLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-body text-fg-primary hover:bg-surface-subtle flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 font-semibold transition"
    >
      <span className="text-fg-secondary">{icon}</span>
      {children}
    </Link>
  );
}
