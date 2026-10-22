import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveActiveAgencyContext: vi.fn(),
  isAgencyAdmin: vi.fn(),
  getAgencyProviderConfig: vi.fn(),
  setAgencyProviderConfig: vi.fn(),
  removeAgencyProviderConfig: vi.fn(),
  recordProviderTestResult: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: mocks.resolveActiveAgencyContext,
}));
vi.mock("@/lib/auth/policy", () => ({ isAgencyAdmin: mocks.isAgencyAdmin }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/social/provider-config", () => ({
  getAgencyProviderConfig: mocks.getAgencyProviderConfig,
  setAgencyProviderConfig: mocks.setAgencyProviderConfig,
  removeAgencyProviderConfig: mocks.removeAgencyProviderConfig,
  recordProviderTestResult: mocks.recordProviderTestResult,
  hasAgencyProviderConfig: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const { removeProviderConfigAction, setProviderConfigAction, testProviderConfigAction } =
  await import("@/app/(app)/app/agency-settings/social/providers/actions");

const validInput = {
  appId: "tiktok-client-id",
  appSecret: "secret-value",
  loginConfigId: null,
  graphApiVersion: null,
  enabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "session-user" } });
  mocks.resolveActiveAgencyContext.mockResolvedValue({ agencyId: "agency-1" });
  mocks.isAgencyAdmin.mockResolvedValue(true);
  mocks.getAgencyProviderConfig.mockResolvedValue({
    appId: "tiktok-client-id",
    appSecret: "sealed-secret",
    loginConfigId: null,
    graphApiVersion: null,
    enabled: true,
  });
  mocks.setAgencyProviderConfig.mockResolvedValue(undefined);
  mocks.removeAgencyProviderConfig.mockResolvedValue(undefined);
  mocks.recordProviderTestResult.mockResolvedValue(undefined);
});

describe("agency social provider actions", () => {
  it("returns a stable sign-in error code without touching provider configuration", async () => {
    mocks.auth.mockResolvedValue(null);

    await expect(
      setProviderConfigAction("agency-1", "attacker", "tiktok", validInput),
    ).resolves.toEqual({
      errorCode: "sign_in_required",
    });
    expect(mocks.setAgencyProviderConfig).not.toHaveBeenCalled();
  });

  it("returns a stable validation code instead of English Zod text", async () => {
    await expect(
      setProviderConfigAction("agency-1", "session-user", "tiktok", {
        ...validInput,
        appId: "",
      }),
    ).resolves.toEqual({ errorCode: "invalid_input" });
    expect(mocks.setAgencyProviderConfig).not.toHaveBeenCalled();
  });

  it("rejects a tampered provider id before reading or changing configuration", async () => {
    const invalidProvider = "instagram" as "meta" | "tiktok";

    await expect(
      setProviderConfigAction("agency-1", "session-user", invalidProvider, validInput),
    ).resolves.toEqual({ errorCode: "invalid_input" });
    await expect(removeProviderConfigAction("agency-1", invalidProvider)).resolves.toEqual({
      errorCode: "invalid_input",
    });
    await expect(testProviderConfigAction("agency-1", invalidProvider)).resolves.toEqual({
      errorCode: "invalid_input",
    });

    expect(mocks.getAgencyProviderConfig).not.toHaveBeenCalled();
    expect(mocks.setAgencyProviderConfig).not.toHaveBeenCalled();
    expect(mocks.removeAgencyProviderConfig).not.toHaveBeenCalled();
    expect(mocks.recordProviderTestResult).not.toHaveBeenCalled();
  });

  it("uses the authenticated actor when saving provider settings", async () => {
    await expect(
      setProviderConfigAction("agency-1", "attacker", "tiktok", validInput),
    ).resolves.toEqual({ saved: true });

    expect(mocks.setAgencyProviderConfig).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ agencyId: "agency-1", actorId: "session-user" }),
    );
  });

  it("returns a stable save failure code without exposing internal error details", async () => {
    mocks.setAgencyProviderConfig.mockRejectedValue(new Error("database detail"));

    await expect(
      setProviderConfigAction("agency-1", "session-user", "tiktok", validInput),
    ).resolves.toEqual({ errorCode: "save_failed" });
  });

  it("allows TikTok credential checks without a Login Kit config id", async () => {
    const result = await testProviderConfigAction("agency-1", "tiktok");

    expect(result).toEqual({
      testResult: { ok: true, messageCodes: ["format_check_passed"] },
    });
    expect("saved" in result).toBe(false);
    expect(mocks.recordProviderTestResult).toHaveBeenCalledWith({}, "agency-1", "tiktok", {
      ok: true,
      errorCode: null,
    });
  });

  it("returns a localized-test code when Meta's required login config is missing", async () => {
    const result = await testProviderConfigAction("agency-1", "meta");

    expect(result).toEqual({
      testResult: { ok: false, messageCodes: ["meta_login_config_required"] },
    });
  });

  it("returns a stable test failure code when provider configuration cannot be read", async () => {
    mocks.getAgencyProviderConfig.mockRejectedValue(new Error("database detail"));

    await expect(testProviderConfigAction("agency-1", "meta")).resolves.toEqual({
      errorCode: "test_failed",
    });
  });

  it("returns a stable removal failure code without exposing internal errors", async () => {
    mocks.removeAgencyProviderConfig.mockRejectedValue(new Error("database detail"));

    await expect(removeProviderConfigAction("agency-1", "meta")).resolves.toEqual({
      errorCode: "remove_failed",
    });
  });
});
