"use client";

import * as React from "react";
import { FormField } from "@/components/forms/form-field";
import { updateThemePreferenceAction } from "./actions";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme/preferences";

type ThemePreferenceLabels = {
  label: string;
  hint: string;
  system: string;
  light: string;
  dark: string;
  saving: string;
  saved: string;
  failed: string;
};

export function ThemePreferenceForm({
  preference,
  labels,
}: {
  preference: ThemePreference;
  labels: ThemePreferenceLabels;
}) {
  const [value, setValue] = React.useState<ThemePreference>(preference);
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | "failed">("idle");

  function applyTheme(next: ThemePreference) {
    if (next === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = next;
    }
  }

  async function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as ThemePreference;
    setValue(next);
    setStatus("saving");
    applyTheme(next);
    const result = await updateThemePreferenceAction(next);
    if (!("saved" in result)) {
      setValue(preference);
      setStatus("failed");
      applyTheme(preference);
      return;
    }
    setStatus("saved");
  }

  return (
    <div className="space-y-4" data-testid="theme-preference-form">
      <FormField id="account-theme" label={labels.label} hint={labels.hint}>
        <select
          id="account-theme"
          value={value}
          onChange={onChange}
          disabled={status === "saving"}
          className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
          data-testid="account-theme-input"
        >
          {THEME_PREFERENCES.map((option) => (
            <option key={option} value={option}>
              {labels[option]}
            </option>
          ))}
        </select>
      </FormField>
      <p className="text-label text-fg-muted" role={status === "failed" ? "alert" : "status"}>
        {status === "saving"
          ? labels.saving
          : status === "failed"
            ? labels.failed
            : status === "saved"
              ? labels.saved
              : null}
      </p>
    </div>
  );
}
