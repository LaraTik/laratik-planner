"use client";

import * as React from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "./actions";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * Sign-out form — wraps the shared `signOutAction` server action so
 * one click POSTs the form, calls NextAuth signOut, and lands on
 * /signin. No more two-step NextAuth confirm page.
 *
 * `variant`:
 *  - "button" → prominent destructive Button for the Account page
 *  - "menuitem" → compact styled <button role="menuitem"> for the
 *    user-menu dropdown (matches the Account link styling)
 *
 * data-testids:
 *  - sign-out-form         the wrapping form
 *  - sign-out-button       the submit button
 *  - sign-out-menuitem     the menuitem variant's submit
 */
export function SignOutForm({
  variant = "button",
  label,
  testId,
}: {
  variant?: "button" | "menuitem" | "link";
  label?: React.ReactNode;
  testId?: string;
}) {
  const t = useLocaleT();
  const actionLabel = label ?? t("account.signOutAction");
  if (variant === "link") {
    return (
      <form action={signOutAction} data-testid="sign-out-form">
        <button
          type="submit"
          data-testid={testId}
          className="text-fg-muted text-label hover:text-fg-secondary focus-visible:ring-focus-ring inline-block min-h-0 cursor-pointer rounded-sm px-1 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
        >
          {actionLabel}
        </button>
      </form>
    );
  }
  if (variant === "menuitem") {
    return (
      <form action={signOutAction} data-testid="sign-out-form">
        <button
          type="submit"
          role="menuitem"
          data-testid="sign-out-menuitem"
          className="text-body text-fg-primary hover:bg-surface-subtle flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-1.5 text-start font-semibold"
        >
          <LogOut className="text-fg-secondary h-4 w-4" aria-hidden="true" />
          {actionLabel}
        </button>
      </form>
    );
  }
  return (
    <form action={signOutAction} data-testid="sign-out-form">
      <Button type="submit" variant="destructive" data-testid="sign-out-button">
        <LogOut className="h-4 w-4" aria-hidden="true" />
        {actionLabel}
      </Button>
    </form>
  );
}
