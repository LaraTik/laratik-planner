export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export function parseThemePreference(value: unknown): ThemePreference | null {
  return typeof value === "string" && THEME_PREFERENCES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : null;
}

export function explicitThemeAttribute(preference: ThemePreference): "light" | "dark" | undefined {
  return preference === "system" ? undefined : preference;
}
