/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchWatchlists } from "@/components/workspace/research-watchlists";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

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
  archivedTitle: "Archived watchlists",
  archivedDescription: "Restore a list when it becomes useful again.",
  restore: "Restore watchlist",
  restoring: "Restoring…",
};

describe("ResearchWatchlists", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    refreshMock.mockReset();
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
      expect(screen.getByRole("heading", { name: "Archived watchlists" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Restore watchlist" })).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/research/watchlists/44444444-4444-4444-8444-444444444444",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("refreshes sibling account controls after creating a watchlist", async () => {
    const user = userEvent.setup();
    const created = {
      id: "77777777-7777-4777-8777-777777777777",
      name: "New references",
      description: null,
      shareScope: "me" as const,
      accountIds: [],
    };
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ watchlist: created }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    render(
      <ResearchWatchlists workspaceSlug="acme" canManage initialWatchlists={[]} labels={labels} />,
    );

    await user.type(screen.getByRole("textbox", { name: "Watchlist name" }), "New references");
    await user.click(screen.getByRole("button", { name: "Create watchlist" }));

    await waitFor(() => expect(screen.getByText("New references")).toBeInTheDocument());
    expect(refreshMock).toHaveBeenCalledOnce();
  });

  it("restores an archived watchlist and preserves its members", async () => {
    const user = userEvent.setup();
    const archived = {
      id: "66666666-6666-4666-8666-666666666666",
      name: "Archived delivery references",
      description: null,
      shareScope: "workspace" as const,
      accountIds: ["11111111-1111-4111-8111-111111111111"],
      memberPositions: { "11111111-1111-4111-8111-111111111111": 0 },
    };
    render(
      <ResearchWatchlists
        workspaceSlug="acme"
        canManage
        initialWatchlists={[]}
        initialArchivedWatchlists={[archived]}
        labels={labels}
      />,
    );

    expect(screen.getByText("Archived delivery references")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore watchlist" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Archived watchlists" }),
      ).not.toBeInTheDocument(),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/research/watchlists/66666666-6666-4666-8666-666666666666",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(screen.getByText("Archived delivery references")).toBeInTheDocument();
  });
});
