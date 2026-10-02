/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchWatchlist } from "@/components/workspace/research-watchlist";

const labels = {
  title: "Research watchlist",
  description: "Keep reference accounts close to planning.",
  addTitle: "Add an account",
  platform: "Platform",
  handle: "Handle",
  displayName: "Display name",
  sourceUrl: "Profile URL",
  add: "Add to watchlist",
  sourceOnly: "Source reference only",
  providerAvailable: "Provider metrics available",
  providerUnsupported: "Provider metrics unavailable",
  providerError: "Provider check failed",
  remove: "Remove",
  error: "Could not update the watchlist.",
  invalid: "Enter valid values.",
  duplicate: "Already on the watchlist.",
  membership: "Named watchlists",
  membershipDescription: "Keep different research questions separate.",
  membershipError: "Could not update this account's watchlist membership.",
};

describe("ResearchWatchlist", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            account: {
              id: "22222222-2222-4222-8222-222222222222",
              platform: "instagram",
              handle: "competitor",
              displayName: "Competitor",
              sourceUrl: "https://instagram.com/competitor",
              providerStatus: "manual",
            },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("adds a source-only account and keeps its provider status visible", async () => {
    const user = userEvent.setup();
    render(
      <ResearchWatchlist
        workspaceSlug="acme"
        initialAccounts={[]}
        watchlists={[]}
        canManage
        labels={labels}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /Handle/ }), "@competitor");
    await user.type(
      screen.getByRole("textbox", { name: /Profile URL/ }),
      "https://instagram.com/competitor",
    );
    await user.click(screen.getByRole("button", { name: "Add to watchlist" }));

    await waitFor(() => expect(screen.getByText("Competitor")).toBeInTheDocument());
    expect(screen.getByText("Source reference only")).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/research/watchlist",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("renders existing accounts for read-only reviewers without the add form", () => {
    render(
      <ResearchWatchlist
        workspaceSlug="acme"
        initialAccounts={[
          {
            id: "33333333-3333-4333-8333-333333333333",
            platform: "facebook",
            handle: "brand",
            displayName: "Brand",
            sourceUrl: "https://facebook.com/brand",
            providerStatus: "unsupported",
          },
        ]}
        watchlists={[]}
        canManage={false}
        labels={labels}
      />,
    );

    expect(screen.getByText("Brand")).toBeInTheDocument();
    expect(screen.getByText("Provider metrics unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to watchlist" })).not.toBeInTheDocument();
  });

  it("lets managers assign an account to a named watchlist with an accessible checkbox", async () => {
    const user = userEvent.setup();
    render(
      <ResearchWatchlist
        workspaceSlug="acme"
        initialAccounts={[
          {
            id: "33333333-3333-4333-8333-333333333333",
            platform: "instagram",
            handle: "competitor",
            displayName: "Competitor",
            sourceUrl: "https://instagram.com/competitor",
            providerStatus: "manual",
          },
        ]}
        watchlists={[
          {
            id: "44444444-4444-4444-8444-444444444444",
            name: "Halal grocery competitors",
            description: null,
            shareScope: "workspace",
            accountIds: [],
          },
        ]}
        canManage
        labels={labels}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Halal grocery competitors" });
    await user.click(checkbox);

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/research/watchlists/44444444-4444-4444-8444-444444444444/members",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});
