import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentActor: vi.fn(),
  resolveActiveAgencyContext: vi.fn(),
  isAgencyAdmin: vi.fn(),
  runAnalyticsProbe: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: mocks.currentActor }));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: mocks.resolveActiveAgencyContext,
}));
vi.mock("@/lib/auth/policy", () => ({ isAgencyAdmin: mocks.isAgencyAdmin }));
vi.mock("@/features/social-analytics/server", () => ({
  runAnalyticsProbe: mocks.runAnalyticsProbe,
}));

const { POST } = await import("@/app/api/social/providers/analytics-test/route");

function request(body: unknown = { channelId: "channel-1" }) {
  return new Request("http://localhost/api/social/providers/analytics-test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  mocks.currentActor.mockResolvedValue({ id: "user-1" });
  mocks.resolveActiveAgencyContext.mockResolvedValue({ agencyId: "agency-1" });
  mocks.isAgencyAdmin.mockResolvedValue(true);
  mocks.runAnalyticsProbe.mockResolvedValue({ profile: { channelId: "channel-1" } });
});

async function expectNoStore(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
}

describe("POST /api/social/providers/analytics-test cache policy", () => {
  it("sets no-store on unauthenticated responses", async () => {
    mocks.auth.mockResolvedValue(null);
    await expectNoStore(await POST(request()), 401);
  });

  it("sets no-store on forbidden responses", async () => {
    mocks.isAgencyAdmin.mockResolvedValue(false);
    await expectNoStore(await POST(request()), 403);
  });

  it("sets no-store on invalid input responses", async () => {
    await expectNoStore(await POST(request({ channelId: 5 })), 400);
  });

  it("sets no-store when the requested channel is missing", async () => {
    mocks.runAnalyticsProbe.mockResolvedValue(null);
    await expectNoStore(await POST(request()), 404);
  });

  it("sets no-store on success responses", async () => {
    await expectNoStore(await POST(request()), 200);
  });
});
