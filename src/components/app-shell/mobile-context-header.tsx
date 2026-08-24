"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Workspace = { id: string; name: string; slug: string };

/**
 * Mobile context identity. Desktop keeps context in the persistent
 * sidebar; mobile needs the current workspace in the top bar because
 * the sidebar is replaced by bottom navigation and a More sheet.
 */
export function MobileContextHeader({ workspaces }: { workspaces: Workspace[] }) {
  const pathname = usePathname();
  const slug = pathname.match(/^\/app\/w\/([^/]+)/)?.[1];
  const workspace = slug ? workspaces.find((candidate) => candidate.slug === slug) : undefined;
  const href = workspace ? `/app/w/${workspace.slug}` : "/app";

  return (
    <Link
      href={href}
      className="focus-visible:ring-focus-ring flex min-w-0 items-center gap-2 rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2"
      aria-label={workspace ? `${workspace.name} overview` : "StudioFlow home"}
    >
      <span className="bg-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] font-bold text-white">
        {workspace?.name.charAt(0).toUpperCase() ?? "S"}
      </span>
      <span className="min-w-0">
        <span className="text-body text-fg-primary block truncate font-semibold">
          {workspace?.name ?? "StudioFlow"}
        </span>
        <span className="text-label text-fg-muted block truncate">
          {workspace ? "Workspace" : "My work"}
        </span>
      </span>
    </Link>
  );
}
