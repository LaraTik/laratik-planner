"use client";

import * as React from "react";
import Link from "next/link";
import { HelpCircle, Settings, ShieldCheck, User as UserIcon } from "lucide-react";
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
  isPlatformAdmin?: boolean;
};

/**
 * Localized copy bundle for the user menu. The Server Component
 * parent (`/app/(app)/layout.tsx`) resolves every string through
 * the message catalog and hands the bundle to the client. The
 * client never reaches for the catalog itself.
 */
export type UserMenuCopy = {
  account: string;
  agencySettings: string;
  help: string;
  platformAdmin: string;
  platformAdminTitle: string;
  activeAgencyTitle: string;
  adminSuffix: string;
  menuAriaLabel: string;
  avatarAriaLabel: string;
};

const AvatarTrigger = React.forwardRef<
  HTMLButtonElement,
  {
    user: UserMenuUser;
    compact?: boolean;
    avatarAriaLabel: string;
  } & React.ComponentPropsWithoutRef<"button">
>(function AvatarTrigger(
  { user, compact = false, avatarAriaLabel, className, ...buttonProps },
  ref,
) {
  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      aria-label={avatarAriaLabel}
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
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="bg-surface-subtle text-label flex h-8 w-8 items-center justify-center rounded-full font-semibold">
          {user.name.charAt(0).toUpperCase()}
        </span>
      )}
      {compact ? null : (
        <span className="text-label hidden pe-1 font-semibold sm:inline">{user.name}</span>
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
  copy,
  variant = "desktop",
  activeAgency,
}: {
  user: UserMenuUser;
  buildInfo: BuildInfo;
  copy: UserMenuCopy;
  variant?: "desktop" | "mobile";
  activeAgency?: { name: string; isAdmin: boolean } | null | undefined;
}) {
  if (variant === "mobile") {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <AvatarTrigger
            user={user}
            compact
            avatarAriaLabel={copy.avatarAriaLabel.replace("{name}", user.name)}
          />
        </DialogTrigger>
        <DialogContent
          data-testid="user-menu-mobile"
          className="start-0 top-auto bottom-0 w-full max-w-none translate-x-0 translate-y-0 gap-0 rounded-t-[var(--radius-card)] rounded-b-none p-0"
        >
          <DialogHeader className="border-border border-b px-4 py-4 pe-14">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="truncate">{user.name}</DialogTitle>
              {user.isPlatformAdmin ? (
                <span
                  className="text-label text-info border-info/30 bg-info-subtle inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold"
                  data-testid="user-menu-platform-admin-chip"
                  title={copy.platformAdminTitle}
                >
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                  {copy.platformAdmin}
                </span>
              ) : null}
            </div>
            <DialogDescription className="truncate">{user.email}</DialogDescription>
            {activeAgency ? (
              <p
                className="text-label text-fg-muted truncate"
                data-testid="user-menu-active-agency"
                title={copy.activeAgencyTitle.replace("{name}", activeAgency.name)}
              >
                {activeAgency.name}
                {activeAgency.isAdmin ? copy.adminSuffix : ""}
              </p>
            ) : null}
          </DialogHeader>
          <div role="menu" aria-label={copy.menuAriaLabel} className="space-y-1 p-2 pb-4">
            <DialogClose asChild>
              <Link
                href="/app/account"
                role="menuitem"
                className="text-body text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 font-semibold focus:outline-none focus-visible:ring-2"
              >
                <UserIcon className="text-fg-secondary h-4 w-4" aria-hidden="true" /> {copy.account}
              </Link>
            </DialogClose>
            {user.isAdmin ? (
              <DialogClose asChild>
                <Link
                  href="/app/agency-settings"
                  role="menuitem"
                  className="text-body text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 font-semibold focus:outline-none focus-visible:ring-2"
                >
                  <Settings className="text-fg-secondary h-4 w-4" aria-hidden="true" />{" "}
                  {copy.agencySettings}
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
        <AvatarTrigger
          user={user}
          avatarAriaLabel={copy.avatarAriaLabel.replace("{name}", user.name)}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        data-testid="user-menu"
        aria-label={copy.menuAriaLabel}
        className="w-64"
      >
        <DropdownMenuLabel className="normal-case">
          <span className="text-body text-fg-primary flex items-center gap-2 truncate font-semibold tracking-normal">
            <span className="truncate">{user.name}</span>
            {user.isPlatformAdmin ? (
              <span
                className="text-label text-info border-info/30 bg-info-subtle inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-semibold"
                data-testid="user-menu-platform-admin-chip"
                title={copy.platformAdminTitle}
              >
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                {copy.platformAdmin}
              </span>
            ) : null}
          </span>
          <span className="text-label text-fg-muted block truncate font-normal tracking-normal">
            {user.email}
          </span>
          {activeAgency ? (
            <span
              className="text-label text-fg-muted mt-0.5 block truncate font-normal tracking-normal"
              data-testid="user-menu-active-agency"
              title={copy.activeAgencyTitle.replace("{name}", activeAgency.name)}
            >
              {activeAgency.name}
              {activeAgency.isAdmin ? copy.adminSuffix : ""}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="min-h-11 cursor-pointer">
          <Link href="/app/account">
            <UserIcon className="text-fg-secondary h-4 w-4" aria-hidden="true" /> {copy.account}
          </Link>
        </DropdownMenuItem>
        {user.isAdmin ? (
          <DropdownMenuItem asChild className="min-h-11 cursor-pointer">
            <Link href="/app/agency-settings">
              <Settings className="text-fg-secondary h-4 w-4" aria-hidden="true" />{" "}
              {copy.agencySettings}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild className="min-h-11 cursor-pointer">
          <Link href="https://github.com/LaraTik/laratik-planner">
            <HelpCircle className="text-fg-secondary h-4 w-4" aria-hidden="true" /> {copy.help}
          </Link>
        </DropdownMenuItem>
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
