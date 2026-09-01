"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Bell } from "lucide-react";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  setNotificationPreferencesAction,
  type NotificationPreferencesActionState,
} from "./actions";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * FEAT-08 (GAP-FULL-REVIEW-2026-08-25) — the two notification
 * preference columns were dormant in the schema. This form makes
 * them writable from the account page.
 *
 * Two toggles:
 *  - Email me when I'm mentioned → email_enabled for the `mention`
 *    kind. Master prompt §8: emails default OFF; opt-in.
 *  - Send me a daily digest → digest_enabled on the `system` row
 *    (single source of truth, since the digest is a user-level
 *    switch, not a per-kind one).
 *
 * The form posts the booleans as "on" or absent; the server action
 * coerces and persists. Success state shows a banner above the form
 * and resets the form to the just-saved values on next paint.
 */
const initialState: NotificationPreferencesActionState = {};

export function NotificationPreferencesForm({
  initialEmailOnMention,
  initialDailyDigest,
}: {
  initialEmailOnMention: boolean;
  initialDailyDigest: boolean;
}) {
  const t = useLocaleT();
  const [state, formAction] = useActionState<NotificationPreferencesActionState, FormData>(
    setNotificationPreferencesAction,
    initialState,
  );
  const formRef = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if ("saved" in state && state.saved) {
      formRef.current?.reset();
    }
  }, [state]);

  const errorMessage = "error" in state && state.error ? state.error : null;

  const toggleClass =
    "border-border bg-surface focus-visible:ring-focus-ring flex w-full items-start gap-3 rounded-[var(--radius-control)] border p-3 hover:bg-surface-subtle focus-within:ring-2 focus-within:ring-offset-1";

  return (
    <div className="space-y-4" data-testid="notification-preferences-form-wrapper">
      {errorMessage ? (
        <div
          role="alert"
          data-testid="notification-preferences-error"
          className="border-danger/20 bg-danger-subtle text-danger flex items-start gap-3 rounded-[var(--radius-control)] border p-3"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-body">{errorMessage}</span>
        </div>
      ) : null}
      {"saved" in state && state.saved ? (
        <div
          role="status"
          data-testid="notification-preferences-success"
          className="border-success/20 bg-success-subtle text-success flex items-start gap-3 rounded-[var(--radius-control)] border p-3"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-body">{t("account.notificationPreferencesSaved")}</span>
        </div>
      ) : null}

      <form
        ref={formRef}
        action={formAction}
        className="space-y-3"
        data-testid="notification-preferences-form"
      >
        <div className={toggleClass} data-testid="notification-preferences-email-row">
          <Checkbox
            id="notification-preferences-email"
            name="emailOnMention"
            value="on"
            defaultChecked={initialEmailOnMention}
            aria-describedby="notification-preferences-email-hint"
            data-testid="notification-preferences-email-input"
          />
          <div className="space-y-0.5">
            <label
              htmlFor="notification-preferences-email"
              className="text-body text-fg-primary flex cursor-pointer items-center gap-2 font-semibold"
            >
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              {t("account.emailOnMentionLabel")}
            </label>
            <p id="notification-preferences-email-hint" className="text-label text-fg-muted">
              {t("account.emailOnMentionHint")}
            </p>
          </div>
        </div>

        <div className={toggleClass} data-testid="notification-preferences-digest-row">
          <Checkbox
            id="notification-preferences-digest"
            name="dailyDigest"
            value="on"
            defaultChecked={initialDailyDigest}
            aria-describedby="notification-preferences-digest-hint"
            data-testid="notification-preferences-digest-input"
          />
          <div className="space-y-0.5">
            <label
              htmlFor="notification-preferences-digest"
              className="text-body text-fg-primary flex cursor-pointer items-center gap-2 font-semibold"
            >
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              {t("account.dailyDigestLabel")}
            </label>
            <p id="notification-preferences-digest-hint" className="text-label text-fg-muted">
              {t("account.dailyDigestHint")}
            </p>
          </div>
        </div>

        <FormSubmitButton
          label={t("account.savePreferences")}
          pendingLabel={t("account.savingProfile")}
          data-testid="notification-preferences-submit"
        />
      </form>
    </div>
  );
}
