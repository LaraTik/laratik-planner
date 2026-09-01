"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { updateProfileAction, type ProfileActionState } from "./actions";
import { SUPPORTED_LOCALES } from "@/lib/i18n/locales";

/**
 * Profile editor — display name, name, avatar URL, locale.
 *
 * One form, one server action. Field errors are surfaced inline via
 * the shared FormField component. A top-of-form banner covers errors
 * that don't map to a single field (e.g. sign-in expired). On
 * success, the form key bumps so uncontrolled inputs are reset to
 * the just-saved values, and a success banner renders above the
 * form.
 *
 * data-testids:
 *  - profile-form         the form element
 *  - profile-error        the top-of-form danger banner (when shown)
 *  - profile-success      the top-of-form success banner (when shown)
 *  - profile-submit       the submit button
 *  - profile-display-name / profile-name / profile-image / profile-locale
 *
 * The locale `<select>` enumerates `en` and `ar` with their
 * native labels. Native script ("English" / "العربية") is used
 * rather than translated labels because the user is choosing
 * the *name* of the language, not a translated description of
 * it. The `aria-current` attribute announces the active
 * selection to screen readers.
 */

const initialState: ProfileActionState = {};

const controlClass =
  "border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none";

export function ProfileForm({
  values,
}: {
  values: {
    displayName: string;
    name: string;
    image: string;
    locale: string;
  };
}) {
  const [state, formAction] = useActionState<ProfileActionState, FormData>(
    updateProfileAction,
    initialState,
  );
  const formRef = React.useRef<HTMLFormElement>(null);
  // After a successful save, reset the form so uncontrolled inputs
  // pick up the refreshed `defaultValue` props (the parent page
  // re-renders with the saved values via revalidatePath). The reset
  // runs in an effect so it lands on the next paint, after the
  // banner appears.
  React.useEffect(() => {
    if ("saved" in state && state.saved) {
      formRef.current?.reset();
    }
  }, [state]);

  const errorMessage = "error" in state && state.error ? state.error : null;
  const fieldError =
    "error" in state && state.field && typeof state.field === "string" ? state.field : null;

  return (
    <div className="space-y-4" data-testid="profile-form-wrapper">
      {errorMessage ? (
        <div
          role="alert"
          data-testid="profile-error"
          className="border-danger/20 bg-danger-subtle text-danger flex items-start gap-3 rounded-[var(--radius-control)] border p-3"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-body">{errorMessage}</span>
        </div>
      ) : null}
      {"saved" in state && state.saved ? (
        <div
          role="status"
          data-testid="profile-success"
          className="border-success/20 bg-success-subtle text-success flex items-start gap-3 rounded-[var(--radius-control)] border p-3"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-body">Profile saved.</span>
        </div>
      ) : null}

      <form
        ref={formRef}
        action={formAction}
        className="grid gap-4 md:grid-cols-2"
        data-testid="profile-form"
      >
        <FormField
          id="profile-display-name"
          label="Display name"
          hint="Shown next to your avatar across the app."
          required
          {...(fieldError === "displayName" && errorMessage ? { error: errorMessage } : {})}
        >
          <Input
            type="text"
            name="displayName"
            required
            defaultValue={values.displayName}
            maxLength={80}
            autoComplete="name"
            data-testid="profile-display-name-input"
          />
        </FormField>

        <FormField
          id="profile-name"
          label="Full name"
          hint="Used in invitations and exports."
          {...(fieldError === "name" && errorMessage ? { error: errorMessage } : {})}
        >
          <Input
            type="text"
            name="name"
            defaultValue={values.name}
            maxLength={80}
            autoComplete="name"
            data-testid="profile-name-input"
          />
        </FormField>

        <FormField
          id="profile-image"
          label="Avatar URL"
          hint="Paste a link to a hosted image (https://…). Leave blank to use your initials."
          {...(fieldError === "image" && errorMessage ? { error: errorMessage } : {})}
          className="md:col-span-2"
        >
          <Input
            type="url"
            name="image"
            defaultValue={values.image}
            placeholder="https://example.com/avatar.png"
            autoComplete="off"
            inputMode="url"
            data-testid="profile-image-input"
          />
        </FormField>

        <FormField
          id="profile-locale"
          label="Language"
          hint="More languages ship as the app is translated."
          {...(fieldError === "locale" && errorMessage ? { error: errorMessage } : {})}
        >
          <select
            id="profile-locale"
            name="locale"
            defaultValue={values.locale}
            aria-current={values.locale ? "true" : undefined}
            className={controlClass}
            data-testid="profile-locale-input"
          >
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l.code} value={l.code} lang={l.code} dir={l.dir}>
                {l.nativeLabel}
              </option>
            ))}
          </select>
        </FormField>

        <div className="md:col-span-2">
          <FormSubmitButton
            label="Save profile"
            pendingLabel="Saving…"
            data-testid="profile-submit"
          />
        </div>
      </form>
    </div>
  );
}
