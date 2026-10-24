import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  resolveActiveAgencyContext: vi.fn(),
  isAgencyAdmin: vi.fn(),
  enforceRateLimit: vi.fn(),
  decideSupportAccessRequest: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/current-actor", () => ({ currentActor: mocks.currentActor }));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: mocks.resolveActiveAgencyContext,
}));
vi.mock("@/lib/auth/policy", () => ({ isAgencyAdmin: mocks.isAgencyAdmin }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/support", () => ({
  decideSupportAccessRequest: mocks.decideSupportAccessRequest,
  SupportAccessError: class SupportAccessError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const { decideAgencySupportRequestAction } =
  await import("@/app/(app)/app/agency-settings/plan/support/actions");

function decisionFormData(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("requestId", "4f96e904-9e66-4dcc-9405-80f5d20924d9");
  formData.set("decision", "approved");
  formData.set("reason", "Verified ticket and scope");
  for (const [key, value] of Object.entries(overrides)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentActor.mockResolvedValue({ id: "admin-1" });
  mocks.resolveActiveAgencyContext.mockResolvedValue({ agencyId: "agency-1" });
  mocks.isAgencyAdmin.mockResolvedValue(true);
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
  mocks.decideSupportAccessRequest.mockResolvedValue(undefined);
});

describe("agency support access decisions", () => {
  it("requires a signed-in agency admin before reaching the decision service", async () => {
    mocks.currentActor.mockResolvedValue(null);

    await expect(decideAgencySupportRequestAction({}, decisionFormData())).resolves.toEqual({
      errorCode: "unauthorized",
    });
    expect(mocks.decideSupportAccessRequest).not.toHaveBeenCalled();
  });

  it("rejects non-admins in the active agency", async () => {
    mocks.isAgencyAdmin.mockResolvedValue(false);

    await expect(decideAgencySupportRequestAction({}, decisionFormData())).resolves.toEqual({
      errorCode: "unauthorized",
    });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.decideSupportAccessRequest).not.toHaveBeenCalled();
  });

  it("validates submitted input before authentication or mutation", async () => {
    await expect(
      decideAgencySupportRequestAction({}, decisionFormData({ decision: "defer" })),
    ).resolves.toEqual({ errorCode: "invalid_input" });
    expect(mocks.currentActor).not.toHaveBeenCalled();
    expect(mocks.decideSupportAccessRequest).not.toHaveBeenCalled();
  });

  it("rate limits an authorized decision", async () => {
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false });

    await expect(decideAgencySupportRequestAction({}, decisionFormData())).resolves.toEqual({
      errorCode: "rate_limited",
    });
    expect(mocks.decideSupportAccessRequest).not.toHaveBeenCalled();
  });

  it("passes the active agency as a tenant boundary and revalidates affected pages", async () => {
    const formData = decisionFormData({ grantDownloads: "on" });

    await expect(decideAgencySupportRequestAction({}, formData)).resolves.toEqual({
      successCode: "approved",
    });
    expect(mocks.decideSupportAccessRequest).toHaveBeenCalledWith(
      { id: "admin-1" },
      "4f96e904-9e66-4dcc-9405-80f5d20924d9",
      "approved",
      { reason: "Verified ticket and scope", grantDownloads: true },
      "agency-1",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/agency-settings/plan");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/agency-settings/plan/support");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/platform/security");
  });

  it("returns stable failure codes without leaking service errors", async () => {
    mocks.decideSupportAccessRequest.mockRejectedValue(new Error("private database detail"));

    await expect(decideAgencySupportRequestAction({}, decisionFormData())).resolves.toEqual({
      errorCode: "decision_failed",
    });
  });
});
