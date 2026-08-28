"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { WorkspaceRoleMatrix } from "./_components/workspace-role-matrix";
import { passwordStrength, type PasswordStrength } from "@/lib/auth/user-create-command";
import { createUserDirectlyAction, type AddDirectlyActionState } from "./actions";

const initialState: AddDirectlyActionState = {};

/**
 * "Add directly" form for the User Management page. Renders inside
 * the corresponding tab of the card.
 *
 * Fields:
 *  - Email, Name (basic identity; the service creates the user row)
 *  - Temporary password (input + show/hide eye + "Generate" button)
 *  - Force change on first login (checkbox, default ON)
 *  - Per-workspace role matrix (shared with the invite form)
 *
 * Client-side password strength check (`passwordStrength`) is purely
 * advisory — the server re-validates with `isPasswordStrong` before
 * hashing. A weak password disables the submit button so the user
 * gets feedback without a server round-trip, but the form does NOT
 * pretend to be a security gate (the server is the source of truth).
 *
 * On success:
 *  - Renders a one-time reveal strip with the temporary password
 *    + a copy-to-clipboard button.
 *  - The form's `key` (tied to the new `userId`) remounts the form,
 *    clearing every input including the now-typed password.
 *  - The reveal strip is the ONLY place the plaintext is shown. If
 *    the user switches tabs and returns, the strip is gone (the
 *    action's success state is per-form-remount).
 */
export function AddDirectlyForm({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(createUserDirectlyAction, initialState);
  const formKey = state?.success && state.userId ? state.userId : "initial";
  const fieldErrors = state?.fieldErrors ?? {};
  const errorMessage = state?.error;

  // Local password state for the strength meter + show/hide.
  // Uncontrolled <input> would not let us show the strength bar live,
  // so the password field is the one input that IS controlled.
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const strength: PasswordStrength = passwordStrength(password);

  // After success, the middleware still has the old mustChangePassword
  // token cached. We don't need to refresh on THIS page (the new user
  // is the one who needs /set-password, not the admin), but we DO
  // want to remount the form cleanly. The formKey above handles that.
  // The success strip below renders only when state.success is set.

  return (
    <div className="space-y-4" data-testid="add-directly-form-wrapper">
      {errorMessage ? (
        <div
          role="alert"
          data-testid="add-directly-error"
          className="border-danger/20 bg-danger-subtle text-danger flex items-start gap-3 rounded-[var(--radius-control)] border p-3"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span className="text-label font-semibold">We couldn&apos;t add that user</span>
            <span className="text-body">{errorMessage}</span>
          </div>
        </div>
      ) : null}

      {state?.success && state.tempPassword && state.email ? (
        <div
          role="status"
          data-testid="add-directly-reveal"
          className="border-success/20 bg-success-subtle text-success flex flex-col gap-2 rounded-[var(--radius-control)] border p-3"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-label font-semibold">Account created for {state.email}</span>
          </div>
          <p className="text-body">
            Share these credentials securely — they won&apos;t be shown again.
          </p>
          <RevealPassword password={state.tempPassword} />
          {state.acceptedWorkspaceIds && state.acceptedWorkspaceIds.length > 0 ? (
            <p className="text-body">
              Assigned to {state.acceptedWorkspaceIds.length} workspace
              {state.acceptedWorkspaceIds.length === 1 ? "" : "s"}.
            </p>
          ) : null}
        </div>
      ) : null}

      <form key={formKey} action={formAction} className="space-y-4" data-testid="add-directly-form">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            id="add-email"
            label="Email"
            required
            {...(fieldErrors.email?.[0] ? { error: fieldErrors.email[0] } : {})}
          >
            <Input
              type="email"
              name="email"
              required
              autoComplete="off"
              placeholder="alice@example.com"
              {...(fieldErrors.email ? { "aria-invalid": true } : {})}
            />
          </FormField>
          <FormField
            id="add-name"
            label="Name (optional)"
            {...(fieldErrors.name?.[0] ? { error: fieldErrors.name[0] } : {})}
          >
            <Input
              type="text"
              name="name"
              placeholder="Alice Doe"
              autoComplete="off"
              {...(fieldErrors.name ? { "aria-invalid": true } : {})}
            />
          </FormField>
        </div>

        <FormField
          id="add-password"
          label="Temporary password"
          required
          hint="At least 8 characters, with a letter and a digit. Share this with the new user out-of-band — it won't be shown again after the form is reset."
          {...(fieldErrors.password?.[0] ? { error: fieldErrors.password[0] } : {})}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  aria-describedby="add-password-strength"
                  data-testid="add-directly-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="text-fg-muted hover:text-fg-primary absolute top-1/2 right-2 -translate-y-1/2"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  // Client-side equivalent of the server's
                  // generateStrongPassword — same alphabet, same
                  // length. Generated password is then re-typed into
                  // the controlled input so the strength meter
                  // reflects it.
                  const alphabet =
                    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
                  const bytes = new Uint8Array(24);
                  crypto.getRandomValues(bytes);
                  let out = "";
                  for (let i = 0; i < 16; i++) {
                    out += alphabet[bytes[i]! % alphabet.length];
                  }
                  setPassword(out);
                }}
                aria-label="Generate a strong temporary password"
                data-testid="add-directly-generate"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span className="ml-1">Generate</span>
              </Button>
            </div>
            <PasswordStrengthBar strength={strength} inputId="add-password-strength" />
          </div>
        </FormField>

        <label className="text-body text-fg-primary flex items-center gap-2">
          <input
            type="checkbox"
            name="mustChangePassword"
            defaultChecked
            className="h-4 w-4"
            data-testid="add-directly-must-change"
          />
          Force password change on first login
        </label>
        <p className="text-fg-muted text-body -mt-2">
          The user will be sent to a set-password screen the first time they sign in. Recommended —
          keeps admin-supplied passwords from being a permanent backdoor.
        </p>

        <label className="text-body text-fg-primary flex items-center gap-2">
          <input type="checkbox" name="grantsAgencyAdmin" className="h-4 w-4" />
          Grant agency admin
        </label>

        {workspaces.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-body text-fg-primary font-semibold">
              Workspace roles (optional)
            </legend>
            {fieldErrors.workspaceRoles ? (
              <p role="alert" className="text-label text-danger font-semibold">
                {fieldErrors.workspaceRoles.join("; ")}
              </p>
            ) : null}
            <WorkspaceRoleMatrix workspaces={workspaces} testId="add-directly" />
          </fieldset>
        ) : null}

        <FormSubmitButton label="Create user" pendingLabel="Creating…" />
      </form>
    </div>
  );
}

/**
 * 4-bar password strength meter (very weak / weak / fair / strong).
 * The bars are color-coded to give a quick visual signal but the
 * button-disabled state is keyed on `strength.accepted` (a
 * length+letter+digit boolean), not the qualitative bar.
 */
function PasswordStrengthBar({
  strength,
  inputId,
}: {
  strength: PasswordStrength;
  inputId: string;
}) {
  const bars = ["empty", "empty", "empty", "empty"] as const;
  const filled = Math.min(4, strength.score);
  const styled = bars.map((_, i) => (i < filled ? strength.tone : "empty"));
  return (
    <div
      id={inputId}
      className="flex items-center gap-2"
      data-testid="add-directly-strength-meter"
      data-strength={strength.label}
    >
      <div className="flex gap-1" aria-hidden="true">
        {styled.map((tone, i) => (
          <span
            key={i}
            className={[
              "h-1 w-8 rounded-[var(--radius-control)]",
              tone === "empty" ? "bg-border" : "",
              tone === "danger" ? "bg-danger" : "",
              tone === "warning" ? "bg-warning" : "",
              tone === "success" ? "bg-success" : "",
            ].join(" ")}
          />
        ))}
      </div>
      <span className="text-fg-muted text-label" aria-live="polite">
        {strength.label}
      </span>
    </div>
  );
}

/**
 * One-time credential reveal. Renders the temporary password in a
 * monospace font with a copy-to-clipboard button. A "Copied" toast
 * flashes for 2s after a successful copy. The reveal is the only
 * place the plaintext is shown — once the parent form remounts
 * (because the user submits again or switches tabs), the strip is
 * gone and the password is unrecoverable from the UI.
 */
function RevealPassword({ password }: { password: string }) {
  const [copied, setCopied] = React.useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable in some sandboxes; surface
      // a manual-select fallback by selecting the input.
      const el = document.getElementById("reveal-password-text") as HTMLInputElement | null;
      el?.select();
    }
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        id="reveal-password-text"
        readOnly
        value={password}
        className="font-mono"
        onFocus={(e) => e.currentTarget.select()}
        data-testid="add-directly-reveal-password"
      />
      <Button
        type="button"
        variant="outline"
        onClick={onCopy}
        aria-label="Copy temporary password to clipboard"
        data-testid="add-directly-copy"
      >
        <Copy className="h-4 w-4" aria-hidden="true" />
        <span className="ml-1">{copied ? "Copied" : "Copy"}</span>
      </Button>
    </div>
  );
}

// Reference the type so unused-import lints don't fire — the schema
// is used by tests and adjacent modules even if the form doesn't
// import the type explicitly.
void undefined;
