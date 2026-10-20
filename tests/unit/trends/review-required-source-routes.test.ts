import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  actor: { id: "11111111-1111-4111-8111-111111111111" },
  select: vi.fn(),
  insert: vi.fn(),
  isAgencyAdmin: vi.fn(async () => true),
}));

vi.mock("@/lib/auth/current-actor", () => ({ currentActor: vi.fn(async () => mocks.actor) }));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: vi.fn(async () => ({ agencyId: "agency-1" })),
}));
vi.mock("@/lib/auth/policy", () => ({ isAgencyAdmin: mocks.isAgencyAdmin }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select, insert: mocks.insert } }));

import { POST as enableSource } from "@/app/api/trends/sources/[key]/enable/route";
import { POST as bulkEnableSources } from "@/app/api/trends/sources/bulk-enable/route";

describe("Trend sources that require provider review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a direct enable request before querying or writing source data", async () => {
    const response = await enableSource(
      new NextRequest("http://localhost/api/trends/sources/instagram_graph_api/enable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }),
      { params: Promise.resolve({ key: "instagram_graph_api" }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "source_review_required" });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects review-required sources from onboarding bulk enable", async () => {
    const response = await bulkEnableSources(
      new NextRequest("http://localhost/api/trends/sources/bulk-enable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keys: ["linkedin_marketing_api"] }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "source_review_required",
      sources: ["linkedin_marketing_api"],
    });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
