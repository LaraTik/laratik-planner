"use client";

import * as React from "react";
import Link from "next/link";
import { Settings, User as UserIcon } from "lucide-react";
import { SignOutForm } from "@/app/(app)/app/account/sign-out-form";

/**
 * User menu — avatar trigger that opens a dropdown with the account
 * link, an (admin-only) Agency Settings shortcut, and a sign-out
 * link. The dropdown closes on outside click and Escape, and the
 * trigger restores focus to itself when the menu closes.
 */
export function UserMenu({
  user,
}: {
  user: { id: string; name: string; email: string; image: string | null; isAdmin: boolean };
}) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        data-testid="user-menu-trigger"
        className="border-border bg-surface text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring flex min-h-11 items-center gap-2 rounded-full border px-1 py-1 transition-colors focus:outline-none focus-visible:ring-2"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="h-8 w-8 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="bg-surface-subtle text-label flex h-8 w-8 items-center justify-center rounded-full font-semibold">
            {user.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="text-label hidden pr-1 font-semibold sm:inline">{user.name}</span>
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          data-testid="user-menu"
          className="border-border bg-surface absolute right-0 z-50 mt-1.5 w-56 overflow-hidden rounded-[var(--radius-card)] border shadow-lg"
        >
          <div className="border-border border-b px-3 py-2">
            <p className="text-body text-fg-primary truncate font-semibold">{user.name}</p>
            <p className="text-label text-fg-muted truncate">{user.email}</p>
          </div>
          <ul className="py-1">
            <li>
              <Link
                href="/app/account"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="text-body text-fg-primary hover:bg-surface-subtle flex items-center gap-2 px-3 py-2 font-semibold"
              >
                <UserIcon className="text-fg-secondary h-4 w-4" aria-hidden="true" />
                Account
              </Link>
            </li>
            {user.isAdmin ? (
              <li>
                <Link
                  href="/app/agency-settings"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="text-body text-fg-primary hover:bg-surface-subtle flex items-center gap-2 px-3 py-2 font-semibold"
                >
                  <Settings className="text-fg-secondary h-4 w-4" aria-hidden="true" />
                  Agency Settings
                </Link>
              </li>
            ) : null}
          </ul>
          <div className="border-border border-t p-1.5">
            <SignOutForm variant="menuitem" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
