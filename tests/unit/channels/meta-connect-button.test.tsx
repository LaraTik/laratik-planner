import { describe, expect, it, vi } from "vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MetaConnectButton } from "@/app/(app)/app/w/[slug]/channels/meta-connect-button";

describe("MetaConnectButton", () => {
  it("posts the workspace slug and surfaces an accessible start error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Provider disabled" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MetaConnectButton
        slug="acme"
        label="Reconnect Meta"
        pendingLabel="Opening Meta…"
        errorLabel="Try again"
        testId="reconnect-meta-button"
      />,
    );

    fireEvent.click(screen.getByTestId("reconnect-meta-button"));

    await waitFor(() =>
      expect(screen.getByTestId("meta-connect-error")).toHaveTextContent("Try again"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/social/meta/connect",
      expect.objectContaining({
        method: "POST",
        body: new URLSearchParams({ slug: "acme" }),
      }),
    );
  });
});
