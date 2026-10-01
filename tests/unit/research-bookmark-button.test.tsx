/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchBookmarkButton } from "@/components/workspace/research-bookmark-button";

describe("ResearchBookmarkButton", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("saves an unsaved observation and exposes the pressed state", async () => {
    const user = userEvent.setup();
    render(
      <ResearchBookmarkButton
        workspaceSlug="acme"
        observationId="11111111-1111-4111-8111-111111111111"
        initialSaved={false}
        saveLabel="Save to research"
        savedLabel="Saved"
        errorLabel="Could not update research"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save to research" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/research/bookmarks",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows an error without changing saved state when the API rejects", async () => {
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 403 }));
    const user = userEvent.setup();
    render(
      <ResearchBookmarkButton
        workspaceSlug="acme"
        observationId="11111111-1111-4111-8111-111111111111"
        initialSaved={false}
        saveLabel="Save to research"
        savedLabel="Saved"
        errorLabel="Could not update research"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save to research" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Could not update research");
    expect(screen.getByRole("button", { name: "Save to research" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
