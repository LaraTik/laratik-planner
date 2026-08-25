import { beforeEach, describe, expect, it, vi } from "vitest";

const actorMock = vi.hoisted(() => vi.fn());
const serviceMock = vi.hoisted(() => ({
  grant: vi.fn(),
  change: vi.fn(),
  revoke: vi.fn(),
}));
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/current-actor", () => ({ currentActor: actorMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/platform/access", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/platform/access")>("@/lib/platform/access");
  return {
    ...actual,
    grantPlatformAccess: serviceMock.grant,
    changePlatformRole: serviceMock.change,
    revokePlatformAccess: serviceMock.revoke,
  };
});

const actions = await import("@/app/(app)/app/platform/access/actions");
const accessService = await import("@/lib/platform/access");

const ACTOR_ID = "00000000-0000-4000-8000-00000000c001";
const TARGET_ID = "00000000-0000-4000-8000-00000000c002";

beforeEach(() => {
  actorMock.mockReset();
  actorMock.mockResolvedValue({ id: ACTOR_ID });
  serviceMock.grant.mockReset();
  serviceMock.change.mockReset();
  serviceMock.revoke.mockReset();
  revalidatePathMock.mockReset();
});

describe("platform access actions", () => {
  it("accepts only closed roles and does not call the service on invalid input", async () => {
    const data = new FormData();
    data.set("email", "person@example.com");
    data.set("role", "super_admin");
    data.set("reason", "Operational need");
    const result = await actions.grantPlatformAccessAction({}, data);
    expect(result.error).toBeTruthy();
    expect(serviceMock.grant).not.toHaveBeenCalled();
  });

  it("returns a minimal safe grant state", async () => {
    serviceMock.grant.mockResolvedValue({
      userId: TARGET_ID,
      role: "support_operator",
      unchanged: false,
      secretDatabaseRow: "must not escape",
    });
    const data = new FormData();
    data.set("email", "person@example.com");
    data.set("role", "support_operator");
    data.set("reason", "Support rotation");
    const result = await actions.grantPlatformAccessAction({}, data);
    expect(serviceMock.grant).toHaveBeenCalledWith(
      { id: ACTOR_ID },
      {
        email: "person@example.com",
        role: "support_operator",
        reason: "Support rotation",
      },
    );
    expect(result).toEqual({
      ok: true,
      email: "person@example.com",
      role: "support_operator",
      unchanged: false,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/platform/access");
  });

  it("requires a reason for role changes and revocations", async () => {
    for (const action of [actions.changePlatformRoleAction, actions.revokePlatformAccessAction]) {
      const data = new FormData();
      data.set("userId", TARGET_ID);
      data.set("role", "platform_auditor");
      data.set("reason", "x");
      const result = await action({}, data);
      expect(result.error).toBeTruthy();
    }
    expect(serviceMock.change).not.toHaveBeenCalled();
    expect(serviceMock.revoke).not.toHaveBeenCalled();
  });

  it("surfaces the final-Owner domain code", async () => {
    serviceMock.revoke.mockRejectedValue(
      new accessService.PlatformAccessServiceError(
        accessService.PlatformAccessErrorCode.LastOwner,
        "At least one active Platform Owner must remain.",
      ),
    );
    const data = new FormData();
    data.set("userId", TARGET_ID);
    data.set("reason", "Owner offboarding");
    const result = await actions.revokePlatformAccessAction({}, data);
    expect(result).toMatchObject({
      error: "At least one active Platform Owner must remain.",
      code: accessService.PlatformAccessErrorCode.LastOwner,
    });
  });
});
