import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// `useFormStatus` is a React 19 server-action hook that only works
// inside a <form action>. Mock it so the form is always "not pending"
// in the test environment.
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormStatus: vi.fn(),
  };
});

// Stub the action — we never submit, just assert the binding exists.
vi.mock("@/app/(app)/app/w/[slug]/brand-kit/actions", () => ({
  createColorAssetAction: vi.fn(),
  archiveColorAssetAction: vi.fn(),
}));

import { useFormStatus } from "react-dom";
import { ColorForm } from "@/app/(app)/app/w/[slug]/brand-kit/color-form";

const mockedUseFormStatus = vi.mocked(useFormStatus);

describe("ColorForm", () => {
  it("renders a name, hex, and color-picker input plus a submit button", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(<ColorForm slug="test-slug" />);
    expect(screen.getByLabelText(/color name/i)).toBeInTheDocument();
    // FormField renders the required marker as a trailing '*', so the
    // label text is "Hex *" — match loosely.
    expect(screen.getByLabelText(/hex/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/pick a color/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add color/i })).toBeInTheDocument();
  });

  it("uses a single hidden hex field for the form submission", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(<ColorForm slug="test-slug" />);
    // Only one `name="hex"` input should be in the DOM — the visible
    // text input. The color picker mirrors the same value via
    // React state, not as a second field.
    const hexInputs = document.querySelectorAll<HTMLInputElement>('input[name="hex"]');
    expect(hexInputs).toHaveLength(1);
  });
});
