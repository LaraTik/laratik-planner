import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/i18n/locale-provider", () => ({
  useLocaleT: () => (key: string) => key,
}));

import { OnboardingWizard } from "@/app/(app)/app/a/[agencySlug]/w/[slug]/trends/_components/onboarding-wizard";
import { TrendSourcesAdmin } from "@/app/(app)/app/agency-settings/trend-sources/_components/trend-sources-admin";

describe("review-required Trends sources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("explains and disables review-required sources during workspace onboarding", () => {
    render(
      <OnboardingWizard
        workspaceSlug="acme"
        isAdmin
        onClose={vi.fn()}
        onAcknowledgeTos={vi.fn()}
      />,
    );

    expect(screen.getByTestId("source-toggle-instagram_graph_api")).toBeDisabled();
    expect(screen.getByTestId("source-toggle-linkedin_marketing_api")).toBeDisabled();
    expect(screen.getAllByTestId("source-review-required")).toHaveLength(2);
  });

  it("blocks new enablement but lets admins disable an existing source", () => {
    render(
      <TrendSourcesAdmin
        sources={[
          {
            key: "instagram_graph_api",
            displayName: "Instagram Graph API",
            enabled: true,
            tier: "free",
            tosClass: "review_required",
            cadence: "6h",
            tosAcknowledgedAt: null,
            hasApiKey: true,
          },
        ]}
        health={[]}
      />,
    );

    expect(screen.getByTestId("admin-source-toggle-instagram_graph_api")).not.toBeDisabled();
    expect(screen.getByTestId("admin-source-toggle-linkedin_marketing_api")).toBeDisabled();
    expect(screen.getAllByTestId("admin-source-review-note")).toHaveLength(2);
  });
});
