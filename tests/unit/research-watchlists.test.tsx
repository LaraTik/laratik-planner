/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchWatchlists } from "@/components/workspace/research-watchlists";

const labels = {
  title: "Account watchlists",
  description: "Group reference accounts.",
  addTitle: "Create a watchlist to organize accounts.",
  name: "Watchlist name",
  namePlaceholder: "e.g. Competitors",
  shareScope: "Visibility",
  privateScope: "Only me",
  workspaceScope: "Workspace",
  create: "Create watchlist",
  creating: "Creating…",
  duplicate: "Already exists.",
  error: "Could not update the watchlist.",
  accountCount: "{count} accounts",
  members: "Ordered members",
  target: "Target watchlist",
  moveUp: "Move up",
  moveDown: "Move down",
  copy: "Copy",
  move: "Move",
  archive: "Archive watchlist",
  archiving: "Archiving…",
};

describe("ResearchWatchlists", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const initialWatchlists = [
    {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Halal grocery competitors",
      description: null,
      shareScope: "workspace" as const,
      accountIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      memberPositions: {
        "11111111-1111-4111-8111-111111111111": 0,
        "22222222-2222-4222-8222-222222222222": 1,
      },
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      name: "Delivery references",
      description: null,
      shareScope: "workspace" as const,
      accountIds: [],
      memberPositions: {},
    },
  ];

  it("offers keyboard-accessible reorder and copy controls", async () => {
    const user = userEvent.setup();
    render(
      <ResearchWatchlists
        workspaceSlug="acme"
        canManage
        initialWatchlists={initialWatchlists}
        accounts={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            label: "Fresh Market",
            handle: "@freshmarket",
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            label: "Quick Basket",
            handle: "@quickbasket",
          },
        ]}
        labels={labels}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Move down: Fresh Market" }));
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/research/watchlists/44444444-4444-4444-8444-444444444444/members",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    await user.click(screen.getAllByRole("button", { name: "Copy" })[0]!);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/research/watchlists/44444444-4444-4444-8444-444444444444/members",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("archives a watchlist through a recoverable server action", async () => {
    const user = userEvent.setup();
    render(
      <ResearchWatchlists
        workspaceSlug="acme"
        canManage
        initialWatchlists={initialWatchlists}
        labels={labels}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "Archive watchlist" })[0]!);
    await waitFor(() =>
      expect(screen.queryByText("Halal grocery competitors")).not.toBeInTheDocument(),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/research/watchlists/44444444-4444-4444-8444-444444444444",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
