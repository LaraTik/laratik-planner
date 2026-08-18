"use client";

import * as React from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * User menu — profile link + sign out.
 * Sign out hits NextAuth's /api/auth/signout endpoint.
 */
export function UserMenu({
  user,
}: {
  user: { id: string; name: string; email: string; image: string | null };
}) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/app/account"
        className="border-border bg-surface text-fg-primary hover:bg-surface-subtle text-label flex h-9 items-center gap-2 rounded-full border px-2 font-semibold transition"
      >
        <span className="bg-surface-subtle text-label flex h-7 w-7 items-center justify-center rounded-full font-semibold">
          {user.name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden pr-1 sm:inline">{user.name}</span>
      </Link>
      <Button variant="ghost" size="icon" asChild aria-label="Sign out">
        <Link href="/api/auth/signout">
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
