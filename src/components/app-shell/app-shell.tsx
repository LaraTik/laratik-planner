import Link from "next/link";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileNav } from "./mobile-nav";

/**
 * App shell — sidebar (left, persistent on desktop, drawer on mobile) +
 * topbar (right of sidebar). The content area is the {children}.
 *
 * Per master prompt §3:
 *  - Desktop ≥1280px: expanded sidebar (240px), 64px topbar
 *  - Tablet 768-1279px: collapsed icon rail (64px), 64px topbar, touch ≥44px
 *  - Mobile <768px: bottom navigation, full-screen sheets
 */
export function AppShell({
  user,
  children,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    isAdmin: boolean;
  };
  children: React.ReactNode;
}) {
  return (
    <div className="bg-canvas flex min-h-screen flex-col">
      {/* Desktop sidebar (hidden below 768px) */}
      <aside className="bg-surface border-border fixed inset-y-0 left-0 z-30 hidden w-60 border-r md:flex md:flex-col">
        <Sidebar user={user} />
      </aside>

      {/* Topbar (desktop + tablet) */}
      <header className="bg-surface border-border sticky top-0 z-20 ml-0 hidden h-16 border-b md:ml-60 md:block">
        <Topbar user={user} />
      </header>

      {/* Mobile topbar */}
      <header className="bg-surface border-border sticky top-0 z-20 flex h-14 items-center justify-between border-b px-4 md:hidden">
        <Link href="/app" className="text-title-card text-fg-primary font-semibold">
          laratik-planner
        </Link>
        <Link
          href="/app/account"
          className="border-border bg-surface text-fg-primary text-label flex h-9 w-9 items-center justify-center rounded-full border font-semibold"
          aria-label="Account"
        >
          {user.name.charAt(0).toUpperCase()}
        </Link>
      </header>

      {/* Main content area */}
      <main className="pb-16 md:ml-60 md:pt-16 md:pb-0">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>

      {/* Mobile bottom nav (hidden on tablet+) */}
      <MobileNav />
    </div>
  );
}
