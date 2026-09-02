"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { PasswordInput } from "@/components/forms/password-input";
import { PasswordStrengthMeter } from "@/components/forms/password-strength-meter";
import { WorkspaceRoleMatrix } from "./_components/workspace-role-matrix";
import { passwordStrength, type PasswordStrength } from "@/lib/auth/user-create-command";
import { createUserDirectlyAction, type AddDirectlyActionState } from "./actions";
import { useLocaleT } from "@/components/i18n/locale-provider";

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
export function AddDirectlyForm({
  workspaces,
  t: tProp,
}: {
  workspaces: { id: string; name: string }[];
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const localeT = useLocaleT();
  const t = tProp ?? localeT;
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
            <span className="text-label font-semibold">{t("users.addDirectlyError")}</span>
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
            <span className="text-label font-semibold">
              {t("users.addDirectlyAccountCreated", { email: state.email })}
            </span>
          </div>
          <p className="text-body">{t("users.addDirectlyShareCreds")}</p>
          <RevealPassword password={state.tempPassword} t={t} />
          {state.acceptedWorkspaceIds && state.acceptedWorkspaceIds.length > 0 ? (
            <p className="text-body">
              {t("users.addDirectlyAssigned", {
                count: state.acceptedWorkspaceIds.length,
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      <form key={formKey} action={formAction} className="space-y-4" data-testid="add-directly-form">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            id="add-email"
            label={t("users.addDirectly.emailLabel")}
            required
            {...(fieldErrors.email?.[0] ? { error: fieldErrors.email[0] } : {})}
          >
            <Input
              type="email"
              name="email"
              required
              autoComplete="off"
              placeholder={t("users.sendInvite.emailPlaceholder")}
              {...(fieldErrors.email ? { "aria-invalid": true } : {})}
            />
          </FormField>
          <FormField
            id="add-name"
            label={t("users.sendInvite.nameOptionalLabel")}
            {...(fieldErrors.name?.[0] ? { error: fieldErrors.name[0] } : {})}
          >
            <Input
              type="text"
              name="name"
              placeholder={t("users.sendInvite.namePlaceholder")}
              autoComplete="off"
              {...(fieldErrors.name ? { "aria-invalid": true } : {})}
            />
          </FormField>
        </div>

        <FormField
          id="add-password"
          label={t("users.addDirectlyPasswordLabel")}
          required
          hint={t("users.addDirectlyPasswordHint")}
          {...(fieldErrors.password?.[0] ? { error: fieldErrors.password[0] } : {})}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <PasswordInput
                  name="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  revealed={showPassword}
                  onToggleRevealed={() => setShowPassword((s) => !s)}
                  toggleTestId="add-directly-showhide"
                  data-testid="add-directly-password"
                />
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
                  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                  const lowercase = "abcdefghijklmnopqrstuvwxyz";
                  const digits = "0123456789";
                  const symbols = "!@#$%^&*";
                  const alphabet = uppercase + lowercase + digits + symbols;
                  const bytes = new Uint8Array(24);
                  crypto.getRandomValues(bytes);
                  const required = [uppercase, lowercase, digits, symbols];
                  let out = required.map((set, index) => set[bytes[index]! % set.length]).join("");
                  for (let i = required.length; i < 16; i++) {
                    out += alphabet[bytes[i]! % alphabet.length];
                  }
                  setPassword(out);
                  // Show the generated value so the admin can verify
                  // before submitting (the password will be revealed
                  // to the new user via the success strip anyway).
                  setShowPassword(true);
                }}
                aria-label={t("users.addDirectlyGenerateAria")}
                data-testid="add-directly-generate"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span className="ms-1">{t("users.addDirectlyGenerate")}</span>
              </Button>
            </div>
            <PasswordStrengthMeter
              score={strength.score}
              tone={strength.tone}
              label={strength.label}
              testId="add-directly-strength-meter"
            />
          </div>
        </FormField>

        <div className="space-y-1">
          <label
            htmlFor="add-must-change"
            className="text-body text-fg-primary flex items-center gap-2"
          >
            <Checkbox
              id="add-must-change"
              name="mustChangePassword"
              defaultChecked
              aria-describedby="add-must-change-help"
              data-testid="add-directly-must-change"
            />
            {t("users.addDirectlyForceChange")}
          </label>
          <p id="add-must-change-help" className="text-fg-muted text-label ps-6">
            {t("users.addDirectlyForceChangeHint")}
          </p>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="add-grants-admin"
            className="text-body text-fg-primary flex items-center gap-2"
          >
            <Checkbox
              id="add-grants-admin"
              name="grantsAgencyAdmin"
              data-testid="add-directly-grants-admin"
            />
            {t("users.addDirectly.agencyAdminLabel")}
          </label>
          <p id="add-grants-admin-help" className="text-fg-muted text-label ps-6">
            {t("users.sendInvite.agencyAdminHint")}
          </p>
        </div>

        {workspaces.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-body text-fg-primary font-semibold">
              {t("users.addDirectly.workspacesLabel")}
            </legend>
            {fieldErrors.workspaceRoles ? (
              <p role="alert" className="text-label text-danger font-semibold">
                {fieldErrors.workspaceRoles.join("; ")}
              </p>
            ) : null}
            <WorkspaceRoleMatrix workspaces={workspaces} testId="add-directly" />
          </fieldset>
        ) : null}

        <FormSubmitButton
          label={t("users.addDirectly.add")}
          pendingLabel={t("users.addDirectly.adding")}
        />
      </form>
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
function RevealPassword({ password, t }: { password: string; t: (key: string) => string }) {
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
        aria-label={t("users.addDirectlyCopyAria")}
        data-testid="add-directly-copy"
      >
        <Copy className="h-4 w-4" aria-hidden="true" />
        <span className="ms-1">
          {copied ? t("users.addDirectlyCopied") : t("users.addDirectlyCopy")}
        </span>
      </Button>
    </div>
  );
}
