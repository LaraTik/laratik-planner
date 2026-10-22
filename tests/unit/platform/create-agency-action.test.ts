import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError, ZodIssueCode } from "zod";

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  createAgency: vi.fn(),
  createAgencySchemaParse: vi.fn(),
  overrideSchemaParse: vi.fn(),
  captureError: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: mocks.currentActor }));
vi.mock("@/lib/entitlements", () => ({
  OverrideShapeSchema: { parse: mocks.overrideSchemaParse },
  changeAgencyPlanAsPlatform: vi.fn(),
}));
vi.mock("@/lib/observability/sentry", () => ({ captureError: mocks.captureError }));
vi.mock("@/lib/platform/agencies", () => ({
  AgencyLifecycleActionSchema: { parse: vi.fn() },
  changeAgencyLifecycle: vi.fn(),
  createAgency: mocks.createAgency,
  CreateAgencySchema: { parse: mocks.createAgencySchemaParse },
}));

const { createAgencyAction } = await import("@/app/(app)/app/platform/agencies/actions");

function formData(): FormData {
  const form = new FormData();
  form.set("name", "Northstar Studio");
  form.set("slug", "northstar-studio");
  form.set("adminEmail", "owner@example.com");
  form.set("adminName", "Agency Owner");
  form.set("planTemplateId", "00000000-0000-0000-0000-000000000001");
  form.set("overrides", "{}");
  form.set("reason", "New customer onboarding");
  return form;
}

describe("createAgencyAction result boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentActor.mockResolvedValue({ id: "platform-owner" });
    mocks.createAgencySchemaParse.mockReturnValue({});
    mocks.overrideSchemaParse.mockImplementation((value) => value);
    mocks.createAgency.mockResolvedValue({ id: "agency-1", emailSent: true });
  });

  it("returns a stable generic code without exposing internal exception text", async () => {
    mocks.createAgency.mockRejectedValue(
      new Error("duplicate key value violates internal_customer_secret_constraint"),
    );

    const result = await createAgencyAction({}, formData());

    expect(result).toEqual({ errorCode: "createFailed" });
    expect(JSON.stringify(result)).not.toContain("internal_customer_secret_constraint");
    expect(mocks.captureError).toHaveBeenCalledWith("platform.createAgency", expect.any(Error));
  });

  it("returns a stable input code for schema validation errors", async () => {
    mocks.createAgencySchemaParse.mockImplementation(() => {
      throw new ZodError([
        { code: ZodIssueCode.custom, path: ["slug"], message: "invalid private input" },
      ]);
    });

    const result = await createAgencyAction({}, formData());

    expect(result).toEqual({ errorCode: "invalidInput" });
    expect(JSON.stringify(result)).not.toContain("invalid private input");
    expect(mocks.createAgency).not.toHaveBeenCalled();
  });

  it("localizes the email-send warning at the client presentation boundary", async () => {
    mocks.createAgency.mockResolvedValue({ id: "agency-1", emailSent: false });

    const result = await createAgencyAction({}, formData());

    expect(result).toEqual({
      success: true,
      agencyId: "agency-1",
      warningCode: "adminEmailFailed",
    });
  });

  it("returns a stable session code when there is no actor", async () => {
    mocks.currentActor.mockResolvedValue(null);

    const result = await createAgencyAction({}, formData());

    expect(result).toEqual({ errorCode: "sessionExpired" });
    expect(mocks.createAgency).not.toHaveBeenCalled();
  });
});
