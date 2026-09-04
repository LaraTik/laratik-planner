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
import {
  NotificationKindSchemaValues,
  type NotificationKindForPrefs,
  type NotificationPreferencesSnapshot,
} from "@/lib/notifications/service";

const initialState: NotificationPreferencesActionState = {};

/**
 * R4 — Notification preferences form. The previous version
 * was a 2-checkbox card ("Email me when I'm mentioned" + "Send
 * me a daily digest"). It now exposes the full kind × channel
 * matrix so the user can opt in/out of every per-kind
 * notification.
 *
 * Two channels per kind: "Bell" (in-app popover) + "Email"
 * (a one-off email). Master prompt §8 promises "invitations
 * and security events cannot be disabled" — we honour that
 * by hardcoding the `system` kind's bell checkbox to
 * `disabled=true defaultChecked=true`. Email for `system`
 * events is intentionally not exposed (those events are
 * bell-only by spec).
 *
 * The Daily-digest toggle is a single user-level switch that
 * lives on the `system` row's `digest_enabled` column. It
 * stays outside the matrix because it isn't per-kind — the
 * morning summary aggregates across kinds.
 */
export function NotificationPreferencesForm({
  initialPrefs,
}: {
  initialPrefs: NotificationPreferencesSnapshot;
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

  const errorMessage =
    "errorCode" in state && state.errorCode ? t(`account.errors.${state.errorCode}`) : null;

  // Per-kind rows. The `system` kind is locked-on in the bell per
  // master prompt §8.
  const matrixKinds: NotificationKindForPrefs[] = NotificationKindSchemaValues.filter(
    (k) => k !== "system",
  );

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
        className="space-y-4"
        data-testid="notification-preferences-form"
      >
        {/* Per-kind Bell + Email matrix. */}
        <div
          className="border-border bg-surface overflow-hidden rounded-[var(--radius-control)] border"
          data-testid="notification-preferences-matrix"
        >
          <table className="w-full text-start">
            <thead className="bg-surface-subtle text-label text-fg-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  {t("account.kindColumn")}
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-center font-semibold"
                  aria-describedby="notification-preferences-bell-hint"
                >
                  {t("account.bellColumn")}
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-center font-semibold"
                  aria-describedby="notification-preferences-email-hint"
                >
                  {t("account.emailColumn")}
                </th>
              </tr>
            </thead>
            <tbody>
              {matrixKinds.map((kind) => (
                <tr
                  key={kind}
                  className="border-border border-t"
                  data-testid={`notification-preferences-row-${kind}`}
                >
                  <th
                    scope="row"
                    className="text-body text-fg-primary px-3 py-2 text-start font-normal"
                  >
                    {t(`account.kindLabel.${kind}`)}
                  </th>
                  <td className="px-3 py-2 text-center">
                    <Checkbox
                      id={`notification-preferences-inApp-${kind}`}
                      name={`inApp_${kind}`}
                      value="on"
                      defaultChecked={initialPrefs[kind]?.inAppEnabled ?? true}
                      aria-describedby={`notification-preferences-bell-hint`}
                      data-testid={`notification-preferences-bell-${kind}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Checkbox
                      id={`notification-preferences-email-${kind}`}
                      name={`email_${kind}`}
                      value="on"
                      defaultChecked={initialPrefs[kind]?.emailEnabled ?? false}
                      aria-describedby={`notification-preferences-email-hint`}
                      data-testid={`notification-preferences-email-${kind}`}
                    />
                  </td>
                </tr>
              ))}
              {/* Locked-on system row. Email is intentionally omitted
                  per master prompt §8 — security events are bell-only. */}
              <tr
                className="border-border bg-canvas border-t"
                data-testid="notification-preferences-row-system"
              >
                <th
                  scope="row"
                  className="text-body text-fg-secondary px-3 py-2 text-start font-normal"
                >
                  {t("account.kindLabel.system")}
                  <span className="text-label text-fg-muted ms-2 block sm:inline">
                    {t("account.inAppLockedHint")}
                  </span>
                </th>
                <td className="px-3 py-2 text-center">
                  <Checkbox
                    id="notification-preferences-inApp-system"
                    checked
                    disabled
                    aria-describedby="notification-preferences-locked-hint"
                    data-testid="notification-preferences-bell-system"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <span className="text-label text-fg-muted" aria-hidden="true">
                    —
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p id="notification-preferences-bell-hint" className="text-label text-fg-muted">
          {t("account.bellColumnHint")}
        </p>
        <p id="notification-preferences-email-hint" className="text-label text-fg-muted">
          {t("account.emailColumnHint")}
        </p>

        {/* Daily digest. User-level toggle, lives on the `system` row. */}
        <div
          className="border-border bg-surface hover:bg-surface-subtle flex w-full items-start gap-3 rounded-[var(--radius-control)] border p-3"
          data-testid="notification-preferences-digest-row"
        >
          <Checkbox
            id="notification-preferences-dailyDigest"
            name="dailyDigest"
            value="on"
            defaultChecked={initialPrefs.dailyDigest}
            aria-describedby="notification-preferences-digest-hint"
            data-testid="notification-preferences-daily-digest-input"
          />
          <div className="space-y-0.5">
            <label
              htmlFor="notification-preferences-dailyDigest"
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
