import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PermissionNotice } from "@/components/platform/permission-notice";

describe("PermissionNotice", () => {
  it("announces a visible, non-color-only permission state", () => {
    render(
      <PermissionNotice
        title="Read-only platform access"
        description="Only Platform Owners can change these assignments."
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Read-only platform access");
    expect(screen.getByText(/Only Platform Owners/)).toBeInTheDocument();
    expect(screen.getByTestId("platform-permission-notice-icon")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
