"use client";

import * as React from "react";
import Link from "next/link";
import { Settings, User as UserIcon } from "lucide-react";
import type { BuildInfo } from "@/lib/build-info";
import { SignOutForm } from "@/app/(app)/app/account/sign-out-form";
import {
  CopyBuildInfoMenuItem,
  CopyBuildInfoSheetAction,
} from "@/components/build-info/copy-build-info";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type UserMenuUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  isAdmin: boolean;
};

const AvatarTrigger = React.forwardRef<
  HTMLButtonElement,
  { user: UserMenuUser; compact?: boolean } & React.ComponentPropsWithoutRef<"button">
>(function AvatarTrigger({ user, compact = false, className, ...buttonProps }, ref) {
  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      aria-label={`Account menu for ${user.name}`}
      data-testid={compact ? "user-menu-trigger-mobile" : "user-menu-trigger"}
      className={cn(
        "border-border bg-surface text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring flex min-h-11 cursor-pointer items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2",
        compact ? "min-w-11 justify-center p-1" : "gap-2 px-1 py-1",
        className,
      )}
    >
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.image}
          alt=""
          className="h-8 w-8 rounded-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="bg-surface-subtle text-label flex h-8 w-8 items-center justify-center rounded-full font-semibold">
          {user.name.charAt(0).toUpperCase()}
        </span>
      )}
      {compact ? null : (
        <span className="text-label hidden pr-1 font-semibold sm:inline">{user.name}</span>
      )}
    </button>
  );
});

/**
 * Responsive account menu. Desktop uses the Radix dropdown for menu keyboard
 * behavior and focus restoration; mobile uses a focus-trapped bottom sheet.
 * Both expose the same non-sensitive build-copy action.
 */
export function UserMenu({
  user,
  buildInfo,
  variant = "desktop",
}: {
  user: UserMenuUser;
  buildInfo: BuildInfo;
  variant?: "desktop" | "mobile";
}) {
  if (variant === "mobile") {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <AvatarTrigger user={user} compact />
        </DialogTrigger>
        <DialogContent
          data-testid="user-menu-mobile"
          className="top-auto bottom-0 left-0 w-full max-w-none translate-x-0 translate-y-0 gap-0 rounded-t-[var(--radius-card)] rounded-b-none p-0"
        >
          <DialogHeader className="border-border border-b px-4 py-4 pr-14">
            <DialogTitle className="truncate">{user.name}</DialogTitle>
            <DialogDescription className="truncate">{user.email}</DialogDescription>
          </DialogHeader>
          <div role="menu" aria-label="Account" className="space-y-1 p-2 pb-4">
            <DialogClose asChild>
              <Link
                href="/app/account"
                role="menuitem"
                className="text-body text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 font-semibold focus:outline-none focus-visible:ring-2"
              >
                <UserIcon className="text-fg-secondary h-4 w-4" aria-hidden="true" /> Account
              </Link>
            </DialogClose>
            {user.isAdmin ? (
              <DialogClose asChild>
                <Link
                  href="/app/agency-settings"
                  role="menuitem"
                  className="text-body text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 font-semibold focus:outline-none focus-visible:ring-2"
                >
                  <Settings className="text-fg-secondary h-4 w-4" aria-hidden="true" /> Agency
                  Settings
                </Link>
              </DialogClose>
            ) : null}
            <div className="bg-border my-1 h-px" role="separator" />
            <CopyBuildInfoSheetAction buildInfo={buildInfo} />
            <div className="bg-border my-1 h-px" role="separator" />
            <SignOutForm variant="menuitem" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <AvatarTrigger user={user} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        data-testid="user-menu"
        aria-label="Account"
        className="w-64"
      >
        <DropdownMenuLabel className="normal-case">
          <span className="text-body text-fg-primary block truncate font-semibold tracking-normal">
            {user.name}
          </span>
          <span className="text-label text-fg-muted block truncate font-normal tracking-normal">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="min-h-11 cursor-pointer">
          <Link href="/app/account">
            <UserIcon className="text-fg-secondary h-4 w-4" aria-hidden="true" /> Account
          </Link>
        </DropdownMenuItem>
        {user.isAdmin ? (
          <DropdownMenuItem asChild className="min-h-11 cursor-pointer">
            <Link href="/app/agency-settings">
              <Settings className="text-fg-secondary h-4 w-4" aria-hidden="true" /> Agency Settings
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <CopyBuildInfoMenuItem buildInfo={buildInfo} />
        <DropdownMenuSeparator />
        <div className="p-0.5">
          <SignOutForm variant="menuitem" />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
