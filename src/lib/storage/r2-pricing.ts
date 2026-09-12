/**
 * Cloudflare R2 Standard pricing reference.
 *
 * These are provider billing allowances, not LaraTik entitlement limits. Keep
 * this data separate from `storage_bytes`, which is the application's upload
 * enforcement resource.
 *
 * Source: https://developers.cloudflare.com/r2/pricing/
 */
export const CLOUDFLARE_R2_STANDARD_PRICING = {
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
} as const;

export type CloudflareR2PricingMetric = keyof typeof CLOUDFLARE_R2_STANDARD_PRICING;
