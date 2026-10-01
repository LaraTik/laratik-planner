import { describe, expect, it } from "vitest";
import {
  explicitThemeAttribute,
  parseThemePreference,
  THEME_PREFERENCES,
} from "@/lib/theme/preferences";

describe("theme preferences", () => {
  it("accepts the supported values and defaults system to no explicit attribute", () => {
    expect(THEME_PREFERENCES).toEqual(["system", "light", "dark"]);
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("neon")).toBeNull();
    expect(explicitThemeAttribute("system")).toBeUndefined();
    expect(explicitThemeAttribute("dark")).toBe("dark");
  });
});
