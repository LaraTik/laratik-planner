import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AgencySocialProvidersLoading from "@/app/(app)/app/agency-settings/social/providers/loading";

describe("agency social provider loading surface", () => {
  it("uses an accessible card-and-form skeleton matching the route structure", () => {
    render(<AgencySocialProvidersLoading />);

    const loading = screen.getByTestId("agency-providers-loading");
    expect(loading).toHaveAttribute("role", "status");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveAttribute("aria-live", "polite");
    expect(screen.getAllByTestId("provider-config-loading-card")).toHaveLength(2);
    expect(screen.getByTestId("provider-readiness-loading")).toBeInTheDocument();
    expect(screen.getAllByTestId("analytics-probe-loading-card")).toHaveLength(2);
  });
});
