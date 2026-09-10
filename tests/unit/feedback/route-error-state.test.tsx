import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RouteErrorState } from "@/components/feedback/route-error-state";

describe("RouteErrorState", () => {
  it("keeps recovery actions in a predictable order and exposes the reference", () => {
    render(
      <RouteErrorState
        title="Could not load Channels"
        description="Try again or return to the list."
        reset={vi.fn()}
        backHref="/app/w/acme/channels"
        backLabel="Back to Channels"
        errorDigest="digest-123"
        dataTestId="route-error"
      />,
    );

    const root = screen.getByTestId("route-error");
    const actions = root.querySelectorAll("a, button");

    expect(root).toHaveAttribute("role", "alert");
    expect(actions).toHaveLength(3);
    expect(actions[0]).toHaveTextContent("Try again");
    expect(actions[1]).toHaveTextContent("Back to Channels");
    expect(actions[1]).toHaveAttribute("href", "/app/w/acme/channels");
    expect(actions[2]).toHaveTextContent("Back to My Work");
    expect(screen.getByText("digest-123")).toBeInTheDocument();
  });

  it("does not render an empty reference row when no digest exists", () => {
    render(
      <RouteErrorState
        title="Could not load Channels"
        description="Try again or return to the list."
        reset={vi.fn()}
        backHref="/app/w/acme/channels"
        backLabel="Back to Channels"
        errorDigest={undefined}
        dataTestId="route-error"
      />,
    );

    expect(screen.queryByText("Reference:")).not.toBeInTheDocument();
  });
});
