"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { PasswordInput } from "@/components/forms/password-input";
import { PasswordStrengthMeter } from "@/components/forms/password-strength-meter";
import { passwordStrength, type PasswordStrength } from "@/lib/auth/user-create-command";
import { setOwnPasswordAction, type SetPasswordState } from "./actions";

const initialState: SetPasswordState = {};

/**
 * /set-password form.
 *
 * Used as the first-login destination for users created via the
 * "Add directly" admin flow. The form:
 *  - Validates the new password (length + letter + digit) on the
 *    client with the same `passwordStrength` helper as the admin
 *    form, so the visual feedback is consistent.
 *  - Submits to `setOwnPasswordAction` (a server action).
 *  - On success: refreshes the JWT via `useSession().update({ mustChangePassword: false })`
 *    so the first-login redirect middleware stops intercepting,
 *    then `router.push("/app")` to the home.
 *
 * After `state.saved` flips true, the form is hidden and only the
 * success strip renders. This prevents a stale-form re-submit
 * during the brief window between "saved" and the redirect.
 */
export function SetPasswordForm() {
  const [state, formAction] = useActionState(setOwnPasswordAction, initialState);
  const router = useRouter();
  const { update: updateSession } = useSession();
  const [newPassword, setNewPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const strength: PasswordStrength = passwordStrength(newPassword);

  // After a successful save, refresh the JWT (clears
  // `mustChangePassword` on the token) and navigate to /app. The
  // middleware will no longer intercept subsequent requests.
  React.useEffect(() => {
    if (state?.saved) {
      void updateSession({ mustChangePassword: false });
      router.push("/app");
      router.refresh();
    }
  }, [state?.saved, updateSession, router]);

  const fieldErrors = state?.fieldErrors ?? {};
  const errorMessage = state?.error;
  const saved = state?.saved === true;

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <div
          role="alert"
          data-testid="set-password-error"
          className="border-danger/20 bg-danger-subtle text-danger flex items-start gap-3 rounded-[var(--radius-control)] border p-3"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span className="text-label font-semibold">We couldn&apos;t update your password</span>
            <span className="text-body">{errorMessage}</span>
          </div>
        </div>
      ) : null}

      {saved ? (
        <div
          role="status"
          data-testid="set-password-success"
          className="border-success/20 bg-success-subtle text-success flex items-start gap-3 rounded-[var(--radius-control)] border p-3"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span className="text-label font-semibold">Password updated.</span>
            <span className="text-body">Redirecting you to the app…</span>
          </div>
        </div>
      ) : (
        <form action={formAction} className="space-y-4" data-testid="set-password-form">
          <FormField
            id="newPassword"
            label="New password"
            required
            hint="At least 8 characters, with a letter and a digit."
            {...(fieldErrors.newPassword?.[0] ? { error: fieldErrors.newPassword[0] } : {})}
          >
            <div className="space-y-2">
              <PasswordInput
                name="newPassword"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                revealed={showPassword}
                onToggleRevealed={() => setShowPassword((s) => !s)}
                toggleTestId="set-password-showhide"
                // Autofocus on mount so the first-login flow lands
                // the cursor in the password field without an extra
                // click. `autoFocus` on React is the official hook.
                autoFocus
                data-testid="set-password-new"
              />
              <PasswordStrengthMeter
                score={strength.score}
                tone={strength.tone}
                label={strength.label}
                testId="set-password-strength"
              />
            </div>
          </FormField>

          <FormField
            id="confirmPassword"
            label="Confirm new password"
            required
            {...(fieldErrors.confirmPassword?.[0] ? { error: fieldErrors.confirmPassword[0] } : {})}
          >
            <Input
              type={showPassword ? "text" : "password"}
              name="confirmPassword"
              required
              autoComplete="new-password"
              data-testid="set-password-confirm"
            />
          </FormField>

          <FormSubmitButton label="Set password and continue" pendingLabel="Saving…" />
        </form>
      )}
    </div>
  );
}
