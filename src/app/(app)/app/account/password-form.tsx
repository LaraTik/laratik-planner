"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { changePasswordAction, type PasswordActionState } from "./actions";

/**
 * Password card — adapts to whether the user has a password set.
 *
 * - OAuth-only users (no `passwordHash`): the card shows "Set a
 *   password" with new + confirm. A small hint explains that this
 *   lets them also sign in with email + password, and a "Forgot your
 *   password?" link to /signin/forgot-password is available (it
 *   emails them a reset link so they can pick one).
 * - Users with a password: the card shows "Change password" with
 *   current + new + confirm.
 *
 * On success, the success banner copies either "Password set" or
 * "Password changed" depending on the mode reported by the server.
 *
 * data-testids:
 *  - password-form        the form element
 *  - password-card        the wrapping card
 *  - password-error       top-of-form danger banner
 *  - password-success     top-of-form success banner
 *  - password-current / password-new / password-confirm
 *  - password-submit
 */

const initialState: PasswordActionState = {};

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, formAction] = useActionState<PasswordActionState, FormData>(
    changePasswordAction,
    initialState,
  );
  const formRef = React.useRef<HTMLFormElement>(null);
  // After a successful save, reset the form so the password fields
  // clear. The reset is idempotent and harmless on subsequent saves
  // (the form has no defaultValue, so reset() leaves fields blank).
  React.useEffect(() => {
    if ("saved" in state && state.saved) {
      formRef.current?.reset();
    }
  }, [state]);

  const errorMessage = "error" in state && state.error ? state.error : null;
  const fieldError =
    "error" in state && state.field && typeof state.field === "string" ? state.field : null;
  const successMode = "saved" in state && state.saved ? state.mode : null;

  return (
    <div className="space-y-4" data-testid="password-form-wrapper">
      {errorMessage ? (
        <div
          role="alert"
          data-testid="password-error"
          className="border-danger/20 bg-danger-subtle text-danger flex items-start gap-3 rounded-[var(--radius-control)] border p-3"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-body">{errorMessage}</span>
        </div>
      ) : null}

      {successMode ? (
        <div
          role="status"
          data-testid="password-success"
          className="border-success/20 bg-success-subtle text-success flex items-start gap-3 rounded-[var(--radius-control)] border p-3"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-body">
            {successMode === "set" ? "Password set." : "Password changed."}
          </span>
        </div>
      ) : null}

      <form
        ref={formRef}
        action={formAction}
        className="grid gap-4 md:grid-cols-2"
        data-testid="password-form"
      >
        {hasPassword ? (
          <FormField
            id="password-current"
            label="Current password"
            required
            className="md:col-span-2"
            {...(fieldError === "current" && errorMessage ? { error: errorMessage } : {})}
          >
            <Input
              type="password"
              name="current"
              required
              autoComplete="current-password"
              data-testid="password-current-input"
            />
          </FormField>
        ) : null}

        <FormField
          id="password-new"
          label={hasPassword ? "New password" : "Choose a password"}
          hint="At least 8 characters, with a letter and a digit."
          required
          {...(fieldError === "next" && errorMessage ? { error: errorMessage } : {})}
        >
          <Input
            type="password"
            name="next"
            required
            minLength={8}
            maxLength={200}
            autoComplete={hasPassword ? "new-password" : "new-password"}
            data-testid="password-new-input"
          />
        </FormField>

        <FormField
          id="password-confirm"
          label="Confirm new password"
          required
          {...(fieldError === "confirm" && errorMessage ? { error: errorMessage } : {})}
        >
          <Input
            type="password"
            name="confirm"
            required
            minLength={8}
            maxLength={200}
            autoComplete="new-password"
            data-testid="password-confirm-input"
          />
        </FormField>

        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <FormSubmitButton
            label={hasPassword ? "Change password" : "Set password"}
            pendingLabel={hasPassword ? "Changing…" : "Setting…"}
            data-testid="password-submit"
          />
          {!hasPassword ? (
            <Link
              href="/signin/forgot-password"
              className="text-label text-fg-muted hover:text-fg-secondary font-semibold underline-offset-2 hover:underline"
              data-testid="password-forgot-link"
            >
              Forgot your password? Email me a reset link.
            </Link>
          ) : null}
        </div>
      </form>
    </div>
  );
}
