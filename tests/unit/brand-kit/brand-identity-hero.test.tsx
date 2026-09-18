import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandIdentityHero } from "@/app/(app)/app/w/[slug]/brand-kit/brand-identity-hero";

/**
 * The hero used to render `<time dateTime={lastUpdatedAt.toISOString()}>`
 * unconditionally when `lastUpdatedAt` was a Date. If that Date was
 * invalid (NaN time), `.toISOString()` threw a RangeError and crashed
 * the entire Brand Kit overview. After the hardening pass, an invalid
 * Date is treated like a missing one — the "No activity yet" placeholder
 * is rendered instead.
 */
describe("BrandIdentityHero — invalid lastUpdatedAt hardening", () => {
  it("renders the 'No activity yet' placeholder when lastUpdatedAt is an Invalid Date", () => {
    render(
      <BrandIdentityHero
        workspace={{ name: "Acme", timezone: "UTC" }}
        assetCount={1}
        logoCount={1}
        lastUpdatedAt={new Date(NaN)}
      />,
    );
    expect(screen.getByTestId("brand-kit-hero-last-updated-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("brand-kit-hero-last-updated")).toBeNull();
  });

  it("renders the 'last updated' time when lastUpdatedAt is a valid Date", () => {
    render(
      <BrandIdentityHero
        workspace={{ name: "Acme", timezone: "UTC" }}
        assetCount={1}
        logoCount={1}
        lastUpdatedAt={new Date("2026-09-11T09:00:00Z")}
      />,
    );
    expect(screen.getByTestId("brand-kit-hero-last-updated")).toBeInTheDocument();
  });
});
