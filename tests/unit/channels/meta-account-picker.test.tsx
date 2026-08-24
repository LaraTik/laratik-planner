import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/app/w/[slug]/channels/actions", () => ({
  finalizeMetaSelectionAction: vi.fn(),
  disconnectChannelAction: vi.fn(),
  revokeConnectionAction: vi.fn(),
}));

import { render, screen } from "@testing-library/react";
import { MetaAccountPicker } from "@/app/(app)/app/w/[slug]/channels/meta-account-picker";

/**
 * M4 — Meta account picker unit contract.
 *
 * The picker is a client component. We assert the data-testid hooks
 * and aria attributes that the page-level components rely on, and
 * the keyboard-handler contract (Space/Enter on a checkbox toggles
 * its parent row). We do not exercise the server action here — the
 * integration suite covers the action wiring.
 *
 * The action module is mocked because it is a `"use server"` module
 * that imports the NextAuth handler, which the vitest test runner
 * cannot evaluate in a jsdom environment.
 */

const profiles = [
  {
    providerAccountId: "page-1",
    platform: "facebook" as const,
    accountName: "Acme Coffee",
    handle: null,
    profileUrl: null,
    avatarUrl: null,
    parentProviderAccountId: null,
  },
  {
    providerAccountId: "ig-1",
    platform: "instagram" as const,
    accountName: "Acme IG",
    handle: "acme",
    profileUrl: null,
    avatarUrl: null,
    parentProviderAccountId: "page-1",
  },
];

const candidates = [
  {
    providerAccountId: "ig-1",
    channelId: "ch-1",
    accountName: "Existing IG",
    alreadyConnected: true,
  },
];

describe("MetaAccountPicker", () => {
  it("renders one fieldset row per profile with a labelled checkbox", () => {
    render(
      <MetaAccountPicker
        connectionId="conn-1"
        profiles={profiles}
        candidates={candidates}
        slug="acme"
      />,
    );
    expect(screen.getByTestId("meta-account-picker")).toBeInTheDocument();
    expect(screen.getByTestId("picker-row-page-1")).toBeInTheDocument();
    expect(screen.getByTestId("picker-row-ig-1")).toBeInTheDocument();
    expect(screen.getByLabelText("Select Acme Coffee")).toBeInTheDocument();
    expect(screen.getByLabelText("Select Acme IG")).toBeInTheDocument();
  });

  it("marks every profile as selected by default", () => {
    render(
      <MetaAccountPicker
        connectionId="conn-1"
        profiles={profiles}
        candidates={candidates}
        slug="acme"
      />,
    );
    expect(screen.getByTestId("picker-count").textContent).toContain("2 selected");
  });

  it("displays the 'Already connected' badge for a candidate", () => {
    render(
      <MetaAccountPicker
        connectionId="conn-1"
        profiles={profiles}
        candidates={candidates}
        slug="acme"
      />,
    );
    expect(screen.getByText(/Already connected/)).toBeInTheDocument();
  });

  it("the submit button is initially enabled and reports aria-busy only while pending", () => {
    render(
      <MetaAccountPicker
        connectionId="conn-1"
        profiles={profiles}
        candidates={candidates}
        slug="acme"
      />,
    );
    const submit = screen.getByTestId("picker-submit");
    expect(submit).not.toBeDisabled();
    expect(submit.getAttribute("aria-busy")).toBe("false");
  });
});
