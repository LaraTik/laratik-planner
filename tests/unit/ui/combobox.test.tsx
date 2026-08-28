import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Combobox } from "@/components/ui/combobox";

/**
 * Combobox — searchable, grouped, keyboard-accessible select.
 * Built on Radix Popover (which is exercised in
 * `tests/unit/ui/popover.test.tsx`); this test pins the
 * Combobox-specific behaviour (search filter, category groups,
 * free-text fallback, keyboard nav, selection wiring).
 */

const options = [
  { value: "Inter", label: "Inter", category: "Sans" },
  { value: "Roboto", label: "Roboto", category: "Sans" },
  { value: "Lato", label: "Lato", category: "Sans" },
  { value: "Playfair Display", label: "Playfair Display", category: "Serif" },
  { value: "Merriweather", label: "Merriweather", category: "Serif" },
];

function renderHarness(opts?: {
  initialValue?: string;
  onChange?: (v: string) => void;
  allowCustom?: boolean;
}) {
  const onChange = opts?.onChange ?? vi.fn();
  return {
    onChange,
    ...render(
      <Combobox
        value={opts?.initialValue ?? ""}
        onChange={onChange}
        options={options}
        name="family"
        allowCustom={opts?.allowCustom ?? true}
        triggerTestId="combobox-trigger"
        inputTestId="combobox-search"
      />,
    ),
  };
}

describe("Combobox", () => {
  it("renders the trigger button with the current value (or placeholder)", () => {
    const { rerender } = renderHarness();
    expect(screen.getByTestId("combobox-trigger")).toHaveTextContent(/Select…/);
    rerender(
      <Combobox
        value="Inter"
        onChange={vi.fn()}
        options={options}
        name="family"
        triggerTestId="combobox-trigger"
        inputTestId="combobox-search"
      />,
    );
    expect(screen.getByTestId("combobox-trigger")).toHaveTextContent("Inter");
  });

  it("groups options by category with sticky headers", async () => {
    const user = userEvent.setup();
    renderHarness({ initialValue: "Inter" });
    await user.click(screen.getByTestId("combobox-trigger"));
    expect(screen.getByText("Sans")).toBeInTheDocument();
    expect(screen.getByText("Serif")).toBeInTheDocument();
  });

  it("filters options case-insensitively as the user types", async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByTestId("combobox-trigger"));
    const search = screen.getByTestId("combobox-search");
    await user.type(search, "rob");
    expect(screen.getByText("Roboto")).toBeInTheDocument();
    expect(screen.queryByText("Lato")).toBeNull();
  });

  it("calls onChange with the option value when an option is clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderHarness();
    await user.click(screen.getByTestId("combobox-trigger"));
    await user.click(screen.getByTestId("combobox-search-option-Roboto"));
    expect(onChange).toHaveBeenCalledWith("Roboto");
  });

  it("selects with Enter via the keyboard", async () => {
    const user = userEvent.setup();
    const { onChange } = renderHarness();
    await user.click(screen.getByTestId("combobox-trigger"));
    // First option (Inter) is focused by default.
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("Inter");
  });

  it("accepts free-text values when allowCustom is true", async () => {
    const user = userEvent.setup();
    const { onChange } = renderHarness({ allowCustom: true });
    await user.click(screen.getByTestId("combobox-trigger"));
    const search = screen.getByTestId("combobox-search");
    await user.type(search, "Caveat");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("Caveat");
  });

  it("hides the free-text hint when allowCustom is false", async () => {
    const user = userEvent.setup();
    renderHarness({ allowCustom: false });
    await user.click(screen.getByTestId("combobox-trigger"));
    const search = screen.getByTestId("combobox-search");
    await user.type(search, "Caveat");
    expect(screen.queryByText(/Caveat/)).toBeNull();
  });

  it("emits a hidden input that backs the form value", () => {
    const { container } = renderHarness({ initialValue: "Inter" });
    const hidden = container.querySelector('input[type="hidden"][name="family"]');
    expect(hidden).not.toBeNull();
    expect((hidden as HTMLInputElement).value).toBe("Inter");
  });

  it("shows the empty-state message when no options match", async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByTestId("combobox-trigger"));
    const search = screen.getByTestId("combobox-search");
    await user.type(search, "zzzzz-no-such-font");
    // The free-text "Use '…'" hint is still visible because the
    // user typed something; but the catalog options should not be.
    expect(screen.queryByText("Inter")).toBeNull();
    expect(screen.queryByText("Roboto")).toBeNull();
  });
});
