import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CloudflareR2PricingCard } from "@/components/storage/cloudflare-r2-pricing-card";
import { CLOUDFLARE_R2_STANDARD_PRICING } from "@/lib/storage/r2-pricing";

const copy = {
  title: "Cloudflare R2 billing reference",
  description: "Published Standard storage rates and monthly free allowances.",
  standard: "Standard class",
  notConnected: "Billing usage is not connected.",
  metric: "Metric",
  included: "Free each month",
  price: "Price after free allowance",
  storage: "Standard storage",
  classA: "Class A operations",
  classB: "Class B operations",
  gbMonth: "GB-month / month",
  requests: "requests / month",
  millionRequests: "million requests",
  note: "These are Cloudflare billing allowances, not LaraTik upload limits.",
  source: "View Cloudflare R2 pricing",
};

describe("Cloudflare R2 pricing reference", () => {
  it("keeps the published Standard free tier and prices exact", () => {
    expect(CLOUDFLARE_R2_STANDARD_PRICING).toEqual({
      storage: {
        freeAmount: 10,
        freeUnit: "gb_month",
        price: 0.015,
        priceUnit: "gb_month",
        priceDecimals: 3,
      },
      classA: {
        freeAmount: 1_000_000,
        freeUnit: "requests",
        price: 4.5,
        priceUnit: "million_requests",
        priceDecimals: 2,
      },
      classB: {
        freeAmount: 10_000_000,
        freeUnit: "requests",
        price: 0.36,
        priceUnit: "million_requests",
        priceDecimals: 2,
      },
    });
  });

  it("labels provider billing reference separately from LaraTik enforcement", () => {
    render(<CloudflareR2PricingCard copy={copy} locale="en" />);

    expect(screen.getByTestId("cloudflare-r2-pricing")).toHaveTextContent(
      "Cloudflare R2 billing reference",
    );
    expect(screen.getByText("10 GB-month / month")).toBeInTheDocument();
    expect(screen.getByText("1,000,000 requests / month")).toBeInTheDocument();
    expect(screen.getByText("10,000,000 requests / month")).toBeInTheDocument();
    expect(screen.getByText("$0.36 / million requests")).toBeInTheDocument();
    expect(screen.getByText(/not LaraTik upload limits/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View Cloudflare R2 pricing/ })).toHaveAttribute(
      "href",
      "https://developers.cloudflare.com/r2/pricing/",
    );
  });
});
