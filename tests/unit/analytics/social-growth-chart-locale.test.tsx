import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { SocialGrowthChart } from "@/app/(app)/app/w/[slug]/analytics/social/social-growth-chart";

describe("SocialGrowthChart localization", () => {
  it("uses a localized platform label in Arabic", () => {
    render(
      <LocaleProvider locale="ar">
        <SocialGrowthChart
          title="نمو المتابعين"
          platform="instagram_reel"
          profileName="Acme Reels"
          metricLabel="المتابعون"
          points={[{ date: "2026-09-01", value: 12 }]}
          tableId="growth-table"
          testId="growth-chart"
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("growth-chart")).toHaveTextContent("ريل Instagram");
    expect(screen.getByTestId("growth-chart")).not.toHaveTextContent("instagram_reel");
  });
});
