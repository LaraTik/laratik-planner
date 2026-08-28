import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimezoneCombobox } from "@/components/forms/timezone-combobox";

/**
 * Behavioural contract for the workspace-settings timezone picker.
 *
 * The combobox emits the IANA timezone name (e.g. "Europe/Berlin")
 * through a hidden input. The schema in
 * `src/lib/workspaces/settings-command.ts` validates the value with
 * `Intl.DateTimeFormat`, so anything this component emits is accepted
 * by the server. These tests pin the filter / select / keyboard /
 * a11y behaviour so a future rewrite can't silently drop one of them.
 */
describe("TimezoneCombobox", () => {
  it("shows the current value with its offset in the trigger", async () => {
    const onChange = vi.fn();
    render(<TimezoneCombobox value="Europe/Berlin" onChange={onChange} name="timezone" />);
    const trigger = await screen.findByTestId("timezone-combobox-trigger");
    expect(trigger).toHaveTextContent("Europe/Berlin");
    // longOffset is "GMT+01:00" or "GMT+02:00" depending on DST;
    // we only assert the canonical "UTC" prefix (not the literal value)
    // so the test survives the seasonal offset flip.
    expect(trigger.textContent).toMatch(/\(UTC[+\-]\d{2}:\d{2}\)/);
  });

  it("renders a hidden input that carries the current value for form submission", () => {
    const onChange = vi.fn();
    const { container } = render(
      <TimezoneCombobox value="UTC" onChange={onChange} name="timezone" />,
    );
    const hidden = container.querySelector('input[type="hidden"][name="timezone"]');
    expect(hidden).not.toBeNull();
    expect((hidden as HTMLInputElement).value).toBe("UTC");
  });

  it("filters the list as the user types and commits on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimezoneCombobox value="UTC" onChange={onChange} name="timezone" />);
    await user.click(screen.getByTestId("timezone-combobox-trigger"));
    const search = await screen.findByTestId("timezone-combobox-search");
    await user.type(search, "Berlin");
    // Only Europe/Berlin should remain in the listbox.
    const listbox = screen.getByTestId("timezone-combobox-listbox");
    expect(listbox.textContent).toContain("Europe/Berlin");
    // A clearly-different zone is filtered out.
    expect(listbox.textContent).not.toContain("America/New_York");
    // Click commits and calls onChange with the IANA name.
    await user.click(screen.getByRole("option", { name: /Europe\/Berlin/ }));
    expect(onChange).toHaveBeenCalledWith("Europe/Berlin");
  });

  it("shows an empty-state message when the search has no matches", async () => {
    const user = userEvent.setup();
    render(<TimezoneCombobox value="UTC" onChange={() => {}} name="timezone" />);
    await user.click(screen.getByTestId("timezone-combobox-trigger"));
    const search = await screen.findByTestId("timezone-combobox-search");
    await user.type(search, "Pluto/Olympus");
    const listbox = screen.getByTestId("timezone-combobox-listbox");
    expect(listbox.textContent).toMatch(/no timezones match/i);
  });

  it("commits the active option when the user presses Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimezoneCombobox value="UTC" onChange={onChange} name="timezone" />);
    await user.click(screen.getByTestId("timezone-combobox-trigger"));
    const search = await screen.findByTestId("timezone-combobox-search");
    await user.type(search, "Tokyo");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("Asia/Tokyo");
  });

  it("marks the trigger as a combobox with the right ARIA wiring", async () => {
    render(
      <TimezoneCombobox value="UTC" onChange={() => {}} name="timezone" id="settings-timezone" />,
    );
    const trigger = screen.getByTestId("timezone-combobox-trigger");
    expect(trigger).toHaveAttribute("role", "combobox");
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-controls");
    // The hidden input isn't required for ARIA but the trigger id is.
    expect(trigger).toHaveAttribute("id", "settings-timezone");
  });
});
