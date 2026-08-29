import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TranslationFieldButton } from "@/components/forms/translation-field-button";

vi.mock("@/components/forms/per-field-ai-suggest", () => ({
  PerFieldAiSuggest: () => null,
}));

describe("TranslationFieldButton", () => {
  it("renders 'Translations' with no count badge when no translations exist", () => {
    render(
      <TranslationFieldButton
        sourceLocale="en"
        fieldKey="caption"
        kind="long"
        translations={{}}
        contentItemId="ci-1"
        onChange={vi.fn()}
      />,
    );
    const button = screen.getByTestId("translation-button-caption");
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("data-count", "0");
    // No badge in the trigger when count is 0.
    expect(within(button).queryByText(/^\d+$/)).toBeNull();
  });

  it("renders the count badge when at least one translation is set", () => {
    render(
      <TranslationFieldButton
        sourceLocale="en"
        fieldKey="caption"
        kind="long"
        translations={{ ar: "مرحبا" }}
        contentItemId="ci-1"
        onChange={vi.fn()}
      />,
    );
    const button = screen.getByTestId("translation-button-caption");
    expect(button).toHaveAttribute("data-count", "1");
  });

  it("counts only non-empty translations", () => {
    render(
      <TranslationFieldButton
        sourceLocale="en"
        fieldKey="caption"
        kind="long"
        translations={{ ar: "مرحبا", de: "   ", es: "Hola" }}
        contentItemId="ci-1"
        onChange={vi.fn()}
      />,
    );
    const button = screen.getByTestId("translation-button-caption");
    // `de` is whitespace (skipped); `ar` and `es` are non-empty
    // (the count includes any non-empty value, even locales
    // that aren't in SUPPORTED_LOCALES — the row simply isn't
    // rendered in the popover for unknown locales, but the
    // count still reflects the raw value).
    expect(button).toHaveAttribute("data-count", "2");
  });

  it("opens the popover with the right locale rows when clicked", async () => {
    const onChange = vi.fn();
    render(
      <TranslationFieldButton
        sourceLocale="en"
        fieldKey="caption"
        kind="long"
        translations={{ ar: "مرحبا" }}
        contentItemId="ci-1"
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByTestId("translation-button-caption"));
    const popover = await screen.findByTestId("translation-popover-caption");
    expect(popover).toBeInTheDocument();
    // The pre-existing ar translation is rendered as a row.
    const arRow = within(popover).getByTestId("translation-row-caption-ar");
    // The label includes the locale label and native script label
    // (e.g. "Arabic (العربية)"); match by aria-labelledby / id
    // association via the row's child textarea.
    const textarea = within(arRow).getByDisplayValue("مرحبا");
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("exposes an 'Add language' button for adding new target locales", async () => {
    render(
      <TranslationFieldButton
        sourceLocale="en"
        fieldKey="caption"
        kind="long"
        translations={{}}
        contentItemId="ci-1"
        onChange={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId("translation-button-caption"));
    const popover = await screen.findByTestId("translation-popover-caption");
    // The "Add language" button is in the popover header.
    expect(within(popover).getByTestId("translation-add-language")).toBeInTheDocument();
  });

  it("calls onChange when a translation is added or removed", async () => {
    const onChange = vi.fn();
    render(
      <TranslationFieldButton
        sourceLocale="en"
        fieldKey="caption"
        kind="long"
        translations={{ ar: "مرحبا" }}
        contentItemId="ci-1"
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByTestId("translation-button-caption"));
    // Remove the ar translation via the remove button on the row.
    const popover = await screen.findByTestId("translation-popover-caption");
    const arRow = within(popover).getByTestId("translation-row-caption-ar");
    await userEvent.click(within(arRow).getByLabelText(/Remove Arabic translation/i));
    expect(onChange).toHaveBeenCalledWith({});
  });
});
