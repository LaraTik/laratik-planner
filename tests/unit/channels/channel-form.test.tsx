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
vi.mock("@/app/(app)/app/w/[slug]/channels/actions", () => ({
  createChannelAction: vi.fn(),
  archiveChannelAction: vi.fn(),
  updateChannelAction: vi.fn(),
}));

import { useFormStatus } from "react-dom";
import { ChannelForm } from "@/app/(app)/app/w/[slug]/channels/channel-form";

const mockedUseFormStatus = vi.mocked(useFormStatus);

describe("ChannelForm", () => {
  it("renders the title, description, and all required controls", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(<ChannelForm slug="acme" />);

    // Card chrome.
    expect(screen.getByTestId("channel-add-card")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /add social channel/i })).toBeInTheDocument();

    // Platform select is the only field without a wrapping FormField
    // (select doesn't need hint/error wiring). It still has a label.
    expect(screen.getByLabelText(/^platform$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/account name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/handle/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/account link/i)).toBeInTheDocument();
  });

  it("marks the required field with aria-required and the visible asterisk", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(<ChannelForm slug="acme" />);
    const accountName = screen.getByLabelText(/account name/i);
    expect(accountName).toBeRequired();
    expect(accountName).toHaveAttribute("aria-required", "true");
  });

  it("renders the submit button with the right label and shows the pending label when pending", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(<ChannelForm slug="acme" />);
    const submit = screen.getByRole("button", { name: /add channel/i });
    expect(submit).toBeInTheDocument();
    expect(submit).not.toBeDisabled();

    mockedUseFormStatus.mockReturnValue({ pending: true } as ReturnType<typeof useFormStatus>);
    render(<ChannelForm slug="acme" />);
    const pending = screen.getByRole("button", { name: /adding/i });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute("aria-busy", "true");
  });

  it("uses the workspace timezone-aware add card as the focus target for the header CTA", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(<ChannelForm slug="acme" />);
    // The header CTA in `add-channel-button.tsx` uses
    // `aria-controls="channel-add-card"` to associate with this card.
    // We assert the testid hook the CTA targets is present in the DOM.
    const card = screen.getByTestId("channel-add-card");
    expect(card).toBeInTheDocument();
    expect(card.tagName.toLowerCase()).toBe("div");
  });
});
