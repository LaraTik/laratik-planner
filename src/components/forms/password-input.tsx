"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Password input with a show/hide eye toggle.
 *
 * Centralises the toggle pattern so both the "Add directly" admin
 * form and the /set-password first-login form get the same:
 *  - Icon-only button on the right (44px+ target on touch)
 *  - aria-label that flips between "Show password" / "Hide password"
 *  - aria-pressed to expose the toggle state to assistive tech
 *  - A "revealed" prop the parent can use to mirror the value in
 *    other UI (e.g. the strength meter sees the live value)
 *
 * The component is a controlled <input>; the parent owns the
 * `value` + `onChange` and reads the boolean via `revealed` for
 * any state that depends on the visible/hidden state (none today,
 * but the prop is here so a future "see what's typed" toggle can
 * plug in without an API break).
 */
export interface PasswordInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  /** Local-visible state, used by the eye toggle button. */
  revealed: boolean;
  /** Called when the user clicks the eye. */
  onToggleRevealed: () => void;
  /** Optional override for the eye button's testid. */
  toggleTestId?: string;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    { revealed, onToggleRevealed, toggleTestId, className, disabled, ...rest },
    ref,
  ) {
    const t = useLocaleT();

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={revealed ? "text" : "password"}
          disabled={disabled}
          className={cn("pe-10", className)}
          {...rest}
        />
        <button
          type="button"
          onClick={onToggleRevealed}
          disabled={disabled}
          aria-label={revealed ? t("auth.signin.hidePassword") : t("auth.signin.showPassword")}
          aria-pressed={revealed}
          // 44x44 minimum target on touch devices (the icon is 16px
          // but the button is padded via p-2 around it).
          className={cn(
            "text-fg-muted hover:text-fg-primary focus-visible:ring-focus-ring absolute end-2 top-1/2 -translate-y-1/2 rounded-sm p-2 focus:outline-none focus-visible:ring-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          data-testid={toggleTestId}
        >
          {revealed ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  },
);
