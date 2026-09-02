import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const providerRequestMock = vi.fn();

vi.mock("@/lib/social/http", async () => {
  const actual = await vi.importActual<typeof import("@/lib/social/http")>("@/lib/social/http");
  return {
    ...actual,
    providerRequest: providerRequestMock,
  };
});

vi.mock("@/lib/observability/sentry", () => ({
  captureError: vi.fn(),
}));

vi.mock("@/lib/observability/logger", () => ({
  logError: vi.fn(),
}));

const { SocialProviderError } = await import("@/lib/social/http");
const { fetchMetaPageDailyInsights, fetchMetaIgAccountDailyInsights } =
  await import("@/lib/social/providers/meta");

type SuccessBody = {
  data: Array<{
    name: string;
    period: string;
    total_value: { value: number };
  }>;
};

function successResponse(value: number): SuccessBody {
  return {
    data: [
      {
        name: "any",
        period: "day",
        total_value: { value },
      },
    ],
  };
}

function notConfiguredError(): Error {
  return new SocialProviderError("not_configured", false, "req-test-123");
}

function permissionDeniedError(): Error {
  return new SocialProviderError("permission_denied", false, "req-test-456");
}

function transientError(): Error {
  return new SocialProviderError("provider_unavailable", true, "req-test-789");
}

function setupMockByMetricName(responses: Record<string, { body: string | Error }>): void {
  providerRequestMock.mockImplementation((url: string) => {
    // Match metric=... in the URL; for our purposes, an unknown URL
    // should be a no-op so we can fail loudly.
    const match = /metric=([^&]+)/.exec(url);
    const metric = match?.[1] ?? "";
    const entry = responses[metric];
    if (!entry) {
      throw new Error(`unexpected URL in test mock: ${url}`);
    }
    if (entry.body instanceof Error) throw entry.body;
    return Promise.resolve({
      status: 200,
      body: entry.body,
      requestId: "req-test-123",
      usage: { app: null, business: null },
    });
  });
}

describe("fetchMetaPageDailyInsights — per-metric isolation (Rice n Spices fix)", () => {
  beforeEach(() => {
    providerRequestMock.mockReset();
  });

  it("captures all three Page metrics when every request succeeds", async () => {
    setupMockByMetricName({
      page_impressions_unique: { body: JSON.stringify(successResponse(100)) },
      page_views: { body: JSON.stringify(successResponse(42)) },
      page_post_engagements: { body: JSON.stringify(successResponse(7)) },
    });
    const result = await fetchMetaPageDailyInsights({
      accessToken: "token",
      pageId: "123",
      apiVersion: "v25.0",
    });
    expect(result.insights).toEqual({
      reach: 100,
      views: 42,
      engagedAccounts: null,
      interactions: 7,
    });
    expect(result.errors).toEqual([]);
  });

  it("returns null only for the failing metric when one Page request is not_configured", async () => {
    setupMockByMetricName({
      page_impressions_unique: { body: JSON.stringify(successResponse(100)) },
      page_views: { body: notConfiguredError() },
      page_post_engagements: { body: JSON.stringify(successResponse(7)) },
    });
    const result = await fetchMetaPageDailyInsights({
      accessToken: "token",
      pageId: "123",
      apiVersion: "v25.0",
    });
    // The bug we're fixing: previously a not_configured on `page_views`
    // would set ALL three fields (reach, views, interactions) to null.
    // The fix isolates the failure to just the bad metric.
    expect(result.insights.reach).toBe(100);
    expect(result.insights.views).toBeNull();
    expect(result.insights.interactions).toBe(7);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      metric: "views",
      code: "not_configured",
    });
  });

  it("returns null only for the failing metric when one Page request is permission_denied", async () => {
    setupMockByMetricName({
      page_impressions_unique: { body: JSON.stringify(successResponse(100)) },
      page_views: { body: permissionDeniedError() },
      page_post_engagements: { body: JSON.stringify(successResponse(7)) },
    });
    const result = await fetchMetaPageDailyInsights({
      accessToken: "token",
      pageId: "123",
      apiVersion: "v25.0",
    });
    expect(result.insights.reach).toBe(100);
    expect(result.insights.views).toBeNull();
    expect(result.insights.interactions).toBe(7);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("permission_denied");
  });

  it("returns null for all three when every Page request is not_configured", async () => {
    setupMockByMetricName({
      page_impressions_unique: { body: notConfiguredError() },
      page_views: { body: notConfiguredError() },
      page_post_engagements: { body: notConfiguredError() },
    });
    const result = await fetchMetaPageDailyInsights({
      accessToken: "token",
      pageId: "123",
      apiVersion: "v25.0",
    });
    expect(result.insights).toEqual({
      reach: null,
      views: null,
      engagedAccounts: null,
      interactions: null,
    });
    expect(result.errors).toHaveLength(3);
  });

  it("propagates non-silent errors (e.g. provider_unavailable) instead of swallowing them", async () => {
    setupMockByMetricName({
      page_impressions_unique: { body: JSON.stringify(successResponse(100)) },
      page_views: { body: transientError() },
      page_post_engagements: { body: JSON.stringify(successResponse(7)) },
    });
    await expect(
      fetchMetaPageDailyInsights({
        accessToken: "token",
        pageId: "123",
        apiVersion: "v25.0",
      }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
  });

  it("rejects a successful response without a data array as invalid_response", async () => {
    setupMockByMetricName({
      page_impressions_unique: { body: JSON.stringify({}) },
      page_views: { body: JSON.stringify(successResponse(42)) },
      page_post_engagements: { body: JSON.stringify(successResponse(7)) },
    });
    await expect(
      fetchMetaPageDailyInsights({
        accessToken: "token",
        pageId: "123",
        apiVersion: "v25.0",
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});

describe("fetchMetaIgAccountDailyInsights — per-metric isolation (Food Game / Just Halal tr fix)", () => {
  beforeEach(() => {
    providerRequestMock.mockReset();
  });

  it("captures all four IG metrics when every request succeeds", async () => {
    setupMockByMetricName({
      reach: { body: JSON.stringify(successResponse(2164)) },
      profile_views: { body: JSON.stringify(successResponse(67)) },
      accounts_engaged: { body: JSON.stringify(successResponse(13)) },
      total_interactions: { body: JSON.stringify(successResponse(27)) },
    });
    const result = await fetchMetaIgAccountDailyInsights({
      accessToken: "token",
      igUserId: "17841480087235357",
      apiVersion: "v25.0",
    });
    expect(result.insights).toEqual({
      reach: 2164,
      views: 67,
      engagedAccounts: 13,
      interactions: 27,
    });
    expect(result.errors).toEqual([]);
  });

  it("isolates a single failing IG metric to that one field", async () => {
    setupMockByMetricName({
      reach: { body: JSON.stringify(successResponse(2164)) },
      profile_views: { body: notConfiguredError() },
      accounts_engaged: { body: JSON.stringify(successResponse(13)) },
      total_interactions: { body: JSON.stringify(successResponse(27)) },
    });
    const result = await fetchMetaIgAccountDailyInsights({
      accessToken: "token",
      igUserId: "17841480087235357",
      apiVersion: "v25.0",
    });
    expect(result.insights.reach).toBe(2164);
    expect(result.insights.views).toBeNull();
    expect(result.insights.engagedAccounts).toBe(13);
    expect(result.insights.interactions).toBe(27);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      metric: "views",
      code: "not_configured",
    });
  });
});
