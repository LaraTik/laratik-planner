/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CommandCenterSectionNav } from "@/components/workspace/command-center-section-nav";

describe("CommandCenterSectionNav", () => {
  it("marks the first section as the active location before scrolling", () => {
    render(
      <CommandCenterSectionNav
        title="Command Center"
        items={[
          { id: "health", label: "Data health" },
          { id: "trend", label: "Follower trend" },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "Data health" })).toHaveAttribute(
      "aria-current",
      "location",
    );
    expect(screen.getByRole("link", { name: "Follower trend" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
