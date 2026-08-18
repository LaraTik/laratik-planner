"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Folder, Users, Shield } from "lucide-react";

const items = [
  { href: "/app", label: "My Work", icon: Home },
  { href: "/app/workspaces", label: "Workspaces", icon: Folder },
  { href: "/app/users", label: "Users", icon: Users, admin: true },
  { href: "/app/agency-settings", label: "Settings", icon: Shield, admin: true },
];

/**
 * Mobile bottom navigation (master prompt §3: "Mobile <768px: compact
 * top navigation or bottom navigation"). Hidden on tablet+ (md:block).
 */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      className="bg-surface border-border fixed inset-x-0 bottom-0 z-30 border-t md:hidden"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-4 gap-1 px-2 py-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`text-label flex min-h-[var(--control-touch)] flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-2 font-semibold transition ${
                  active
                    ? "bg-primary-subtle text-primary"
                    : "text-fg-secondary hover:bg-surface-subtle"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
