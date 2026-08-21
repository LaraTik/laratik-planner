import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
  createLogoAssetAction: vi.fn(),
  archiveLogoAssetAction: vi.fn(),
  createColorAssetAction: vi.fn(),
  archiveColorAssetAction: vi.fn(),
  createVoiceRuleAction: vi.fn(),
  archiveVoiceRuleAction: vi.fn(),
}));

import { useFormStatus } from "react-dom";
import { LogoForm } from "@/app/(app)/app/w/[slug]/brand-kit/logo-form";

const mockedUseFormStatus = vi.mocked(useFormStatus);

describe("LogoForm", () => {
  it("renders the mode toggles, name input, and submit button in upload mode", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(<LogoForm slug="test-slug" workspaceId="ws-1" />);
    // The mode toggles are exposed as a segmented control.
    expect(screen.getByTestId("logo-mode-upload")).toBeInTheDocument();
    expect(screen.getByTestId("logo-mode-url")).toBeInTheDocument();
    // File input is visible by default (upload mode is the initial mode).
    expect(screen.getByLabelText(/logo file/i)).toBeInTheDocument();
    // Name input is always visible.
    expect(screen.getByLabelText(/logo name/i)).toBeInTheDocument();
    // Submit button.
    expect(screen.getByTestId("logo-submit")).toHaveTextContent(/add logo/i);
  });

  it("switches to URL mode and shows the external URL field", async () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    const user = userEvent.setup();
    render(<LogoForm slug="test-slug" workspaceId="ws-1" />);
    await user.click(screen.getByTestId("logo-mode-url"));
    expect(screen.getByLabelText(/https url/i)).toBeInTheDocument();
    // The file input is gone in URL mode.
    expect(screen.queryByLabelText(/logo file/i)).not.toBeInTheDocument();
  });

  it("disables the submit button while no file is uploaded", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(<LogoForm slug="test-slug" workspaceId="ws-1" />);
    const submit = screen.getByTestId("logo-submit");
    expect(submit).toBeDisabled();
  });

  it("disables the submit button while the form action is pending", () => {
    mockedUseFormStatus.mockReturnValue({ pending: true } as ReturnType<typeof useFormStatus>);
    render(<LogoForm slug="test-slug" workspaceId="ws-1" />);
    const submit = screen.getByTestId("logo-submit");
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent(/adding/i);
  });

  it("has a hidden storagePath input that the upload step populates", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(<LogoForm slug="test-slug" workspaceId="ws-1" />);
    const hidden = screen.getByTestId("logo-storage-path");
    expect(hidden).toBeInTheDocument();
    expect(hidden).toHaveAttribute("type", "hidden");
  });
});
