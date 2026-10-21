import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormActionError } from "@/components/forms/form-action-error";

describe("FormActionError", () => {
  it("announces action errors as alerts and preserves form-owned styling", () => {
    render(
      <FormActionError ariaLive="polite" className="font-semibold">
        The change could not be saved.
      </FormActionError>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The change could not be saved.");
    expect(alert).toHaveAttribute("aria-live", "polite");
    expect(alert).toHaveClass("text-label", "text-danger", "font-semibold");
  });

  it("keeps the default alert announcement when polite timing is not requested", () => {
    render(<FormActionError>Try again.</FormActionError>);

    const alert = screen.getByRole("alert");
    expect(alert).not.toHaveAttribute("aria-live");
  });
});
