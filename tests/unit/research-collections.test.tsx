/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchCollections } from "@/components/workspace/research-collections";

const labels = {
  title: "Research collections",
  description: "Group saved research.",
  name: "Collection name",
  namePlaceholder: "e.g. Q4 hooks",
  shareScope: "Visibility",
  privateScope: "Only me",
  workspaceScope: "Workspace",
  create: "Create collection",
  creating: "Creating…",
  duplicate: "Already exists.",
  error: "Could not update.",
};

describe("ResearchCollections", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            collection: {
              id: "22222222-2222-4222-8222-222222222222",
              name: "Q4 hooks",
              description: null,
              shareScope: "workspace",
              createdBy: "11111111-1111-4111-8111-111111111111",
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

  it("creates a named workspace collection and shows it", async () => {
    const user = userEvent.setup();
    render(
      <ResearchCollections
        workspaceSlug="acme"
        canManage
        initialCollections={[]}
        labels={labels}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Collection name" }), "Q4 hooks");
    await user.selectOptions(screen.getByRole("combobox", { name: "Visibility" }), "workspace");
    await user.click(screen.getByRole("button", { name: "Create collection" }));

    await waitFor(() => expect(screen.getByText("Q4 hooks")).toBeInTheDocument());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/research/collections",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps the collection form hidden for reviewers", () => {
    render(
      <ResearchCollections
        workspaceSlug="acme"
        canManage={false}
        initialCollections={[
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Hooks",
            description: null,
            shareScope: "workspace",
            createdBy: "11111111-1111-4111-8111-111111111111",
          },
        ]}
        labels={labels}
      />,
    );

    expect(screen.getByText("Hooks")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create collection" })).not.toBeInTheDocument();
  });
});
