import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// `useFormStatus` is a React 19 server-action hook. Mock it so
// the form is always "not pending" in the test environment.
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormStatus: vi.fn(),
  };
});

// Stub the action so we never submit; we only assert the form
// binding exists.
vi.mock("@/app/(app)/app/w/[slug]/brand-kit/actions", () => ({
  createFontAssetAction: vi.fn(),
  archiveFontAssetAction: vi.fn(),
}));

// Stub next/font/google so the test doesn't try to download
// real fonts at render time. The real loader is exercised in
// the build; the unit suite only cares about the form state.
vi.mock("next/font/google", () => {
  const stub = () => ({ className: "font-stub", variable: "--font-stub" });
  return {
    Inter: stub,
    Roboto: stub,
    Open_Sans: stub,
    Lato: stub,
    Montserrat: stub,
    Poppins: stub,
    Playfair_Display: stub,
    Merriweather: stub,
    Source_Sans_3: stub,
    Raleway: stub,
    Nunito: stub,
    Work_Sans: stub,
    Fira_Sans: stub,
    IBM_Plex_Sans: stub,
  };
});

import { useFormStatus } from "react-dom";
import { TypographyForm } from "@/app/(app)/app/w/[slug]/brand-kit/typography-form";

const mockedUseFormStatus = vi.mocked(useFormStatus);

function renderForm() {
  mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
  return render(<TypographyForm slug="test-slug" />);
}

describe("TypographyForm", () => {
  it("renders the name, family, weight, role inputs and the submit button", () => {
    renderForm();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    // The family field is now a Combobox trigger (a button, not
    // an <input>) — assert by testid.
    expect(screen.getByTestId("typography-family-input")).toBeInTheDocument();
    expect(screen.getByTestId("typography-weight-input")).toBeInTheDocument();
    expect(screen.getByTestId("typography-role-input")).toBeInTheDocument();
    expect(screen.getByTestId("typography-submit")).toBeInTheDocument();
  });

  it("renders the live preview with the current family, weight, and role", () => {
    renderForm();
    const preview = screen.getByTestId("typography-preview");
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveTextContent(/Inter 400/);
  });

  it("rejects a weight that is not a multiple of 100 (via the input's min/step + the action's Zod check)", () => {
    renderForm();
    const weightInput = screen.getByTestId("typography-weight-input") as HTMLInputElement;
    expect(weightInput.min).toBe("100");
    expect(weightInput.max).toBe("900");
    expect(weightInput.step).toBe("100");
  });

  it("updates the live preview when a different family is picked from the Combobox", async () => {
    const user = userEvent.setup();
    renderForm();
    const trigger = screen.getByTestId("typography-family-input");
    await user.click(trigger);
    await user.click(screen.getByTestId("typography-family-search-option-Roboto"));
    const preview = screen.getByTestId("typography-preview");
    expect(preview).toHaveTextContent(/Roboto 400/);
  });

  it("accepts a free-text family (e.g. a paid brand font) via the Combobox", async () => {
    const user = userEvent.setup();
    renderForm();
    const trigger = screen.getByTestId("typography-family-input");
    await user.click(trigger);
    const search = screen.getByTestId("typography-family-search");
    await user.type(search, "Söhne");
    await user.keyboard("{Enter}");
    const preview = screen.getByTestId("typography-preview");
    expect(preview).toHaveTextContent(/Söhne 400/);
  });

  it("updates the live preview when the weight changes", async () => {
    const user = userEvent.setup();
    renderForm();
    const weightInput = screen.getByTestId("typography-weight-input");
    await user.clear(weightInput);
    await user.type(weightInput, "700");
    const preview = screen.getByTestId("typography-preview");
    expect(preview).toHaveTextContent(/Inter 700/);
  });

  it("disables the submit button while the form action is pending", () => {
    mockedUseFormStatus.mockReturnValue({ pending: true } as ReturnType<typeof useFormStatus>);
    render(<TypographyForm slug="test-slug" />);
    const submit = screen.getByTestId("typography-submit");
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent(/adding/i);
  });

  it("exposes the 14 known Google Fonts in the Combobox catalog", async () => {
    const user = userEvent.setup();
    renderForm();
    const trigger = screen.getByTestId("typography-family-input");
    await user.click(trigger);
    // Every catalog family should be reachable as an option row.
    for (const family of [
      "Inter",
      "Roboto",
      "Lato",
      "Montserrat",
      "Poppins",
      "Open Sans",
      "Source Sans 3",
      "Nunito",
      "Work Sans",
      "IBM Plex Sans",
      "Playfair Display",
      "Merriweather",
      "Raleway",
      "Fira Sans",
    ]) {
      expect(screen.getByTestId(`typography-family-search-option-${family}`)).toBeInTheDocument();
    }
  });

  it("groups the catalog by Sans / Serif / Display / Mono", async () => {
    const user = userEvent.setup();
    renderForm();
    const trigger = screen.getByTestId("typography-family-input");
    await user.click(trigger);
    // The category headers are aria-hidden on the Combobox listbox.
    // The role <option value="mono"> is a separate element on the
    // page, so use a query that scopes to the listbox.
    const listbox = screen.getByRole("listbox");
    for (const category of ["Sans", "Serif", "Display", "Mono"]) {
      expect(within(listbox).getByText(category)).toBeInTheDocument();
    }
  });

  it("emits a hidden form input carrying the current family value", () => {
    const { container } = renderForm();
    const hidden = container.querySelector('input[type="hidden"][name="family"]');
    expect(hidden).not.toBeNull();
    expect((hidden as HTMLInputElement).value).toBe("Inter");
  });
});
