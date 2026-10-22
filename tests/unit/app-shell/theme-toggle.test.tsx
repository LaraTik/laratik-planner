import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";

const copy = { label: "Theme", system: "System", light: "Light", dark: "Dark" };

describe("ThemeToggle", () => {
  it("persists the selected preference through the supplied action", async () => {
    const user = userEvent.setup();
    const updateThemePreferenceAction = vi.fn(async () => ({ saved: true }));
    render(
      <ThemeToggle
        preference="system"
        copy={copy}
        updateThemePreferenceAction={updateThemePreferenceAction}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Theme" });
    await user.click(trigger);
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));
    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));

    await waitFor(() => expect(updateThemePreferenceAction).toHaveBeenCalledWith("dark"));
    expect(trigger.querySelector("svg")).toHaveClass("lucide-moon");
  });

  it("rolls back the selected preference when persistence fails", async () => {
    const user = userEvent.setup();
    const updateThemePreferenceAction = vi.fn(async () => ({ errorCode: "sessionExpired" }));
    render(
      <ThemeToggle
        preference="system"
        copy={copy}
        updateThemePreferenceAction={updateThemePreferenceAction}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Theme" });
    await user.click(trigger);
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));
    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));

    await waitFor(() => expect(updateThemePreferenceAction).toHaveBeenCalledWith("dark"));
    expect(trigger.querySelector("svg")).toHaveClass("lucide-monitor");
  });
});
