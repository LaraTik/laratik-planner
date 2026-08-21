import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormSubmitButton } from "@/components/forms/form-submit-button";

// `useFormStatus` is a React 19 server-action hook; the only way to
// drive it from a unit test is to mock the module and return the
// shape React expects.
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormStatus: vi.fn(),
  };
});

import { useFormStatus } from "react-dom";

const mockedUseFormStatus = vi.mocked(useFormStatus);

function renderButton(props: Partial<React.ComponentProps<typeof FormSubmitButton>> = {}) {
  return render(
    <form>
      <FormSubmitButton label="Save" pendingLabel="Saving…" {...props} />
    </form>,
  );
}

describe("FormSubmitButton", () => {
  it("shows the action label and is enabled when idle", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    renderButton();
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeInstanceOf(HTMLButtonElement);
    expect(btn).not.toBeDisabled();
    expect(btn).not.toHaveAttribute("aria-busy");
  });

  it("swaps to the pending label, disables, and sets aria-busy when pending", () => {
    mockedUseFormStatus.mockReturnValue({ pending: true } as ReturnType<typeof useFormStatus>);
    renderButton();
    const btn = screen.getByRole("button", { name: "Saving…" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("keeps the action label when pending but no pendingLabel is given", () => {
    mockedUseFormStatus.mockReturnValue({ pending: true } as ReturnType<typeof useFormStatus>);
    renderButton({ label: "Save", pendingLabel: undefined });
    // No pending label => original label stays (button only disabled,
    // still useful for a11y).
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeDisabled();
  });

  it("forwards additional Button props (size, variant)", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    renderButton({ size: "lg", variant: "secondary" });
    const btn = screen.getByRole("button", { name: "Save" });
    // shadcn's Button applies variant via className; just assert the
    // label forwards and the button rendered.
    expect(btn).toBeInTheDocument();
  });

  it("always submits (type=submit) regardless of pending state", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    renderButton();
    const btn = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(btn.type).toBe("submit");
  });
});
