"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  ["Overview", ""],
  ["Planning", "/planning"],
  ["Board", "/board"],
  ["Calendar", "/calendar"],
  ["Reviews", "/reviews"],
  ["Design queue", "/design-queue"],
  ["Library", "/library"],
  ["Channels", "/channels"],
  ["Brand kit", "/brand-kit"],
  ["Team", "/team"],
  ["Settings", "/settings"],
  ["AI", "/ai-settings"],
] as const;

const CLIENT_LINKS = [
  ["Client review", "/client"],
  ["Calendar", "/client/calendar"],
] as const;

export function WorkspaceNavigation({
  slug,
  clientOnly = false,
}: {
  slug: string;
  clientOnly?: boolean;
}) {
  const pathname = usePathname();
  const base = `/app/w/${slug}`;
  const links = clientOnly ? CLIENT_LINKS : LINKS;
  return (
    <nav aria-label="Workspace" className="border-border mb-6 overflow-x-auto border-b">
      <div className="flex min-w-max gap-1 lg:min-w-0 lg:flex-wrap">
        {links.map(([label, suffix]) => {
          const href = `${base}${suffix}`;
          const active = suffix ? pathname.startsWith(href) : pathname === base;
          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "text-label inline-flex min-h-11 items-center border-b-2 px-3 py-3 font-semibold",
                active
                  ? "border-primary text-primary"
                  : "text-fg-secondary hover:text-fg-primary border-transparent",
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
