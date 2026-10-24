import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveActiveAgencyContext: vi.fn(),
  loadReport: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: mocks.resolveActiveAgencyContext,
}));
vi.mock("@/lib/reports/storage", () => ({ loadReport: mocks.loadReport }));

const { GET } = await import("@/app/api/reports/[id]/pdf/route");

const reportId = "33333333-3333-4333-8333-333333333333";

function loadedReport(agencyId: string) {
  const bytes = Buffer.from("pdf bytes");
  return {
    row: {
      id: reportId,
      agencyId,
      filename: "analytics-30d-2026-10-01.pdf",
    },
    bytes,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "member-1" } });
  mocks.resolveActiveAgencyContext.mockResolvedValue({ agencyId: "agency-a" });
  mocks.loadReport.mockResolvedValue(null);
});

describe("report PDF download tenant boundary", () => {
  it("uses the same 404 response for a missing report and a foreign-agency report", async () => {
    const missing = await GET({} as never, { params: Promise.resolve({ id: reportId }) });
    mocks.loadReport.mockResolvedValue(loadedReport("agency-b"));
    const foreign = await GET({} as never, { params: Promise.resolve({ id: reportId }) });

    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({ error: "Not found" });
    await expect(foreign.json()).resolves.toEqual({ error: "Not found" });
  });

  it("preserves same-agency downloads for signed-in members", async () => {
    mocks.loadReport.mockResolvedValue(loadedReport("agency-a"));

    const response = await GET({} as never, { params: Promise.resolve({ id: reportId }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });
});
