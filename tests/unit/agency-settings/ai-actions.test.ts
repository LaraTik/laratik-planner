import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentActor: vi.fn(),
  resolveActiveAgencyContext: vi.fn(),
  isAgencyAdmin: vi.fn(),
  updateAiFeatureSettings: vi.fn(),
  testAiConnection: vi.fn(),
  setManagedAiSecret: vi.fn(),
  clearManagedAiSecret: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: mocks.currentActor }));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: mocks.resolveActiveAgencyContext,
}));
vi.mock("@/lib/auth/policy", () => ({ isAgencyAdmin: mocks.isAgencyAdmin }));
vi.mock("@/lib/ai/feature-settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/feature-settings")>()),
  updateAiFeatureSettings: mocks.updateAiFeatureSettings,
  testAiConnection: mocks.testAiConnection,
}));
vi.mock("@/lib/ai/provider-secret", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/provider-secret")>()),
  setManagedAiSecret: mocks.setManagedAiSecret,
  clearManagedAiSecret: mocks.clearManagedAiSecret,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const {
  clearManagedAiSecretAction,
  saveAiSettingsAction,
  setManagedAiSecretAction,
  testAiConnectionAction,
} = await import("@/app/(app)/app/agency-settings/ai/actions");
const { ManagedSecretError } = await import("@/lib/ai/provider-secret");

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "session-user" } });
  mocks.currentActor.mockResolvedValue({ id: "actor-1" });
  mocks.resolveActiveAgencyContext.mockResolvedValue({ agencyId: "agency-1" });
  mocks.isAgencyAdmin.mockResolvedValue(true);
  mocks.updateAiFeatureSettings.mockResolvedValue(undefined);
  mocks.testAiConnection.mockResolvedValue({ ok: true, latencyMs: 42 });
  mocks.setManagedAiSecret.mockResolvedValue({ lastFour: "1234" });
  mocks.clearManagedAiSecret.mockResolvedValue(undefined);
});

describe("agency AI settings actions", () => {
  it("returns stable codes for authorization and validation failures", async () => {
    mocks.isAgencyAdmin.mockResolvedValue(false);
    await expect(saveAiSettingsAction({}, formData({ model: "MiniMax-M3" }))).resolves.toEqual({
      errorCode: "unauthorized",
    });

    mocks.isAgencyAdmin.mockResolvedValue(true);
    await expect(saveAiSettingsAction({}, formData({ model: "" }))).resolves.toEqual({
      errorCode: "invalid_input",
    });
    expect(mocks.updateAiFeatureSettings).not.toHaveBeenCalled();
  });

  it("does not return database or provider errors to the client", async () => {
    mocks.updateAiFeatureSettings.mockRejectedValue(new Error("database connection string"));
    await expect(saveAiSettingsAction({}, formData({ model: "MiniMax-M3" }))).resolves.toEqual({
      errorCode: "save_failed",
    });

    mocks.testAiConnection.mockRejectedValue(new Error("provider response included secret data"));
    await expect(testAiConnectionAction()).resolves.toEqual({ errorCode: "connection_failed" });
  });

  it("returns connection feedback as a code plus numeric latency", async () => {
    await expect(testAiConnectionAction()).resolves.toEqual({
      savedCode: "connection_ok",
      latencyMs: 42,
    });
  });

  it("maps managed-secret failures without exposing exception text", async () => {
    mocks.setManagedAiSecret.mockRejectedValue(new Error("encryption implementation detail"));
    await expect(
      setManagedAiSecretAction({}, formData({ apiKey: "sk-abcdefghijklmnop" })),
    ).resolves.toEqual({ errorCode: "save_failed" });

    mocks.setManagedAiSecret.mockRejectedValue(
      new ManagedSecretError("managed_secret.missing-key", "sensitive key setup detail"),
    );
    await expect(
      setManagedAiSecretAction({}, formData({ apiKey: "sk-abcdefghijklmnop" })),
    ).resolves.toEqual({ errorCode: "missing_encryption_key" });
  });

  it("maps clear failures and invalid input to stable codes", async () => {
    await expect(clearManagedAiSecretAction({}, formData({ reason: "x" }))).resolves.toEqual({
      errorCode: "invalid_input",
    });
    mocks.clearManagedAiSecret.mockRejectedValue(new Error("database details"));
    await expect(clearManagedAiSecretAction({}, formData({ reason: "rotation" }))).resolves.toEqual(
      {
        errorCode: "remove_failed",
      },
    );
  });
});
