"use client";

import * as React from "react";
import { useActionState } from "react";
import { Building2 } from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import {
  editAgencyAction,
  type EditAgencyActionState,
} from "@/app/(app)/app/agency-settings/actions";

const initial: EditAgencyActionState = {};

/**
 * EditAgencyForm (M3.4 — agency CRUD).
 *
 * The editable surface for an agency's own identity: name,
 * slug, locale, timezone. Used by both the agency admin
 * (`/app/agency-settings`) and the platform admin
 * (`/app/platform/agencies/[id]`) — the form is a reusable
 * client component; the page decides whether to render it
 * based on the actor's role.
 *
 * The timezone input is a native <datalist> populated with
 * `Intl.supportedValuesOf('timeZone')`. Browsers offer a
 * autocomplete over the datalist; the server still validates
 * the value via the Zod schema (which uses `Intl.DateTimeFormat`
 * to confirm the timezone is valid).
 *
 * The locale input is a curated list of common locales with a
 * free-text fallback. The server validates as a BCP 47 tag.
 *
 * Slug conflicts surface as an inline `role="alert"` line. The
 * service throws `AgencyUpdateError(SlugConflict)`; the action
 * maps it to the same friendly message.
 */
const COMMON_LOCALES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "pt", label: "Português" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "es", label: "Español" },
  { code: "es-ES", label: "Español (España)" },
  { code: "es-MX", label: "Español (México)" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "nl", label: "Nederlands" },
];

export function EditAgencyForm({
  initialName,
  initialSlug,
  initialLocale,
  initialTimezone,
  testIdPrefix = "agency-settings",
  // Optional override of the action target. When the caller
  // supplies a different `formAction`, the form posts to that
  // action instead of the default `editAgencyAction` (the
  // agency-admin surface). The platform-admin surface passes
  // its own action so the form reuses the same body without
  // needing two copies.
  formAction,
  hiddenFields = {},
}: {
  initialName: string;
  initialSlug: string;
  initialLocale: string;
  initialTimezone: string;
  testIdPrefix?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  hiddenFields?: Record<string, string>;
}) {
  const [state, defaultAction, pending] = useActionState(editAgencyAction, initial);
  void pending; // pending is read by FormSubmitButton via useFormStatus
  const action = formAction ?? defaultAction;
  // Keep the timezone datalist stable; the supported-values list
  // is captured once per mount.
  const timezones = React.useMemo(
    () => (typeof Intl !== "undefined" ? Intl.supportedValuesOf("timeZone") : []),
    [],
  );

  return (
    <Card data-testid={`${testIdPrefix}-edit-identity-card`}>
      <div className="flex items-center gap-2">
        <Building2 className="text-primary h-5 w-5" aria-hidden="true" />
        <CardTitle>Agency identity</CardTitle>
      </div>
      <CardDescription className="mt-2">
        The shared identity for every workspace in your agency. The slug is the unique identifier
        used in URLs.
      </CardDescription>

      <form
        action={action}
        className="mt-5 space-y-4"
        data-testid={`${testIdPrefix}-edit-identity-form`}
      >
        {Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="agency-edit-name">
              Name
              <span aria-hidden="true" className="text-danger ml-0.5">
                *
              </span>
            </Label>
            <Input
              id="agency-edit-name"
              name="name"
              type="text"
              required
              aria-required="true"
              minLength={2}
              maxLength={120}
              defaultValue={initialName}
              data-testid={`${testIdPrefix}-edit-name`}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agency-edit-slug">
              Slug
              <span aria-hidden="true" className="text-danger ml-0.5">
                *
              </span>
            </Label>
            <Input
              id="agency-edit-slug"
              name="slug"
              type="text"
              required
              aria-required="true"
              minLength={2}
              maxLength={60}
              defaultValue={initialSlug}
              pattern="^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$"
              data-testid={`${testIdPrefix}-edit-slug`}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="agency-edit-locale">Locale</Label>
            <p className="text-label text-fg-muted -mt-0.5">BCP 47 tag (e.g. en, en-US, pt-BR)</p>
            <Input
              id="agency-edit-locale"
              name="locale"
              type="text"
              required
              aria-required="true"
              minLength={2}
              maxLength={20}
              defaultValue={initialLocale}
              list="agency-locale-options"
              data-testid={`${testIdPrefix}-edit-locale`}
            />
            <datalist id="agency-locale-options">
              {COMMON_LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agency-edit-timezone">Timezone</Label>
            <p className="text-label text-fg-muted -mt-0.5">
              IANA timezone (e.g. UTC, Europe/Berlin)
            </p>
            <Input
              id="agency-edit-timezone"
              name="timezone"
              type="text"
              required
              aria-required="true"
              minLength={2}
              maxLength={80}
              defaultValue={initialTimezone}
              list="agency-timezone-options"
              data-testid={`${testIdPrefix}-edit-timezone`}
            />
            <datalist id="agency-timezone-options">
              {timezones.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </div>
        </div>

        {state.error ? (
          <p
            role="alert"
            data-testid={`${testIdPrefix}-edit-error`}
            className="text-body text-danger font-semibold"
          >
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p
            role="status"
            data-testid={`${testIdPrefix}-edit-saved`}
            className="text-body text-success font-semibold"
          >
            {state.changedFields && state.changedFields.length > 0
              ? `Agency identity saved (${state.changedFields.join(", ")}).`
              : "Agency identity saved (no changes)."}
          </p>
        ) : null}

        <div className="flex justify-end">
          <FormSubmitButton
            label="Save identity"
            pendingLabel="Saving…"
            data-testid={`${testIdPrefix}-edit-submit`}
          />
        </div>
      </form>
    </Card>
  );
}
