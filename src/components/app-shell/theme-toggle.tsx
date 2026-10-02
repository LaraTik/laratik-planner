"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { updateThemePreferenceAction } from "@/app/(app)/app/account/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme/preferences";

export type ThemeToggleCopy = {
  label: string;
  system: string;
  light: string;
  dark: string;
};

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

function applyTheme(preference: ThemePreference) {
  if (preference === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = preference;
  }
}

export function ThemeToggle({
  preference,
  copy,
}: {
  preference: ThemePreference;
  copy: ThemeToggleCopy;
}) {
  const [value, setValue] = React.useState(preference);
  const [saving, setSaving] = React.useState(false);

  async function onValueChange(next: string) {
    const parsed = next as ThemePreference;
    if (saving || !THEME_PREFERENCES.includes(parsed) || parsed === value) return;
    const previous = value;
    setSaving(true);
    setValue(parsed);
    applyTheme(parsed);
    const result = await updateThemePreferenceAction(parsed);
    if (!("saved" in result)) {
      setValue(previous);
      applyTheme(previous);
    }
    setSaving(false);
  }

  const Icon = THEME_ICONS[value];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={copy.label}
          title={copy.label}
          data-testid="theme-toggle-trigger"
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{copy.label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
          <DropdownMenuRadioItem value="system" disabled={saving}>
            <Monitor className="h-4 w-4" aria-hidden="true" />
            {copy.system}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light" disabled={saving}>
            <Sun className="h-4 w-4" aria-hidden="true" />
            {copy.light}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" disabled={saving}>
            <Moon className="h-4 w-4" aria-hidden="true" />
            {copy.dark}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
