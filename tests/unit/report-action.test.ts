import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveActiveAgencyContext: vi.fn(),
  isAgencyAdmin: vi.fn(),
  resolveAgencyReportSelection: vi.fn(),
  renderReport: vi.fn(),
  listTemplates: vi.fn(),
  saveReport: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: mocks.resolveActiveAgencyContext,
}));
vi.mock("@/lib/auth/policy", () => ({ isAgencyAdmin: mocks.isAgencyAdmin }));
vi.mock("@/features/reports/server", () => ({
  resolveAgencyReportSelection: mocks.resolveAgencyReportSelection,
}));
vi.mock("@/lib/reports/render", () => ({ renderReport: mocks.renderReport }));
vi.mock("@/lib/reports/templates", () => ({ listTemplates: mocks.listTemplates }));
vi.mock("@/lib/reports/storage", () => ({ saveReport: mocks.saveReport }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const { generateReportAction } = await import("@/app/(app)/app/agency-settings/reports/actions");

const workspaceId = "11111111-1111-4111-8111-111111111111";
const channelId = "22222222-2222-4222-8222-222222222222";

function reportFormData(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("templateId", "analytics");
  formData.append("workspaceIds", workspaceId);
  formData.append("channelIds", channelId);
  formData.set("preset", "30d");
  for (const [key, value] of Object.entries(overrides)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "admin-1" } });
  mocks.resolveActiveAgencyContext.mockResolvedValue({ agencyId: "agency-a" });
  mocks.isAgencyAdmin.mockResolvedValue(true);
  mocks.resolveAgencyReportSelection.mockResolvedValue({
    workspaceIds: [workspaceId],
    channelIds: [channelId],
  });
  mocks.listTemplates.mockReturnValue([{ id: "analytics" }]);
  mocks.renderReport.mockResolvedValue({
    templateId: "analytics",
    buffer: Buffer.from("pdf"),
  });
  mocks.saveReport.mockResolvedValue({ id: "report-1" });
});

describe("generateReportAction", () => {
  it("stops before rendering or persistence when the submitted IDs are outside the agency", async () => {
    mocks.resolveAgencyReportSelection.mockResolvedValue(null);

    await expect(generateReportAction({}, reportFormData())).resolves.toEqual({
      errorCode: "selectionChanged",
    });
    expect(mocks.renderReport).not.toHaveBeenCalled();
    expect(mocks.saveReport).not.toHaveBeenCalled();
  });

  it("returns a validation error for an incomplete custom period", async () => {
    await expect(generateReportAction({}, reportFormData({ preset: "custom" }))).resolves.toEqual({
      errorCode: "invalidDateRange",
    });
    expect(mocks.renderReport).not.toHaveBeenCalled();
    expect(mocks.saveReport).not.toHaveBeenCalled();
  });
});
