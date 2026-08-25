import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformRole } from "@/lib/auth/platform-access-types";

vi.mock("server-only", () => ({}));

type DrizzleState = {
  limitResults: Array<unknown[] | Error | undefined>;
};

function makeDrizzleMock(state: DrizzleState) {
  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(() => {
      const next = state.limitResults.shift();
      if (next === undefined) return Promise.resolve([]);
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve(next);
    });
    return chain;
  });
  return { select, state };
}

const dbMock = vi.hoisted(() =>
  makeDrizzleMock({
    limitResults: [],
  }),
);

const loggerMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/observability/logger", () => ({
  logWarn: loggerMock.warn,
  logError: loggerMock.error,
}));

const platformAccess = await import("@/lib/auth/platform-access");

const actor = { id: "00000000-0000-4000-8000-000000000101" };

beforeEach(() => {
  dbMock.state.limitResults = [];
  dbMock.select.mockClear();
  loggerMock.warn.mockClear();
  loggerMock.error.mockClear();
});

describe("platform role permission matrix", () => {
  const expected: Record<PlatformRole, readonly string[]> = {
    platform_owner: platformAccess.PLATFORM_PERMISSIONS,
    agency_operator: [
      "platform.console.read",
      "platform.agency.read",
      "platform.agency.create",
      "platform.agency.update",
      "platform.agency.plan.manage",
      "platform.agency.lifecycle.manage",
    ],
    platform_auditor: [
      "platform.console.read",
      "platform.agency.read",
      "platform.access.read",
      "platform.audit.read",
    ],
    support_operator: [
      "platform.console.read",
      "platform.agency.read",
      "platform.support.request",
    ],
  };

  it.each(Object.entries(expected))("derives the exact %s bundle", (role, permissions) => {
    expect(platformAccess.permissionsForPlatformRole(role as PlatformRole)).toEqual(
      new Set(permissions),
    );
  });

  it("keeps a newly added permission Owner-only until deliberately assigned", () => {
    for (const permission of platformAccess.PLATFORM_PERMISSIONS) {
      expect(
        platformAccess.permissionsForPlatformRole("platform_owner").has(permission),
      ).toBe(true);
    }
    expect(
      platformAccess.permissionsForPlatformRole("agency_operator").has(
        "platform.access.manage",
      ),
    ).toBe(false);
  });
});

describe("getPlatformPrincipal", () => {
  it("returns the active role and derived permissions", async () => {
    dbMock.state.limitResults = [[{ role: "agency_operator" }]];

    await expect(platformAccess.getPlatformPrincipal(actor)).resolves.toEqual({
      actor,
      role: "agency_operator",
      permissions: platformAccess.permissionsForPlatformRole("agency_operator"),
    });
  });

  it("returns null for a missing or revoked assignment", async () => {
    dbMock.state.limitResults = [[]];
    await expect(platformAccess.getPlatformPrincipal(actor)).resolves.toBeNull();
  });

  it("fails closed for an unknown stored role", async () => {
    dbMock.state.limitResults = [[{ role: "root" }]];
    await expect(platformAccess.getPlatformPrincipal(actor)).resolves.toBeNull();
    expect(loggerMock.error).toHaveBeenCalledWith(
      "platform_access.lookup_failed",
      expect.objectContaining({ actorId: actor.id }),
    );
  });

  it("fails closed when the database query rejects", async () => {
    dbMock.state.limitResults = [new Error("database unavailable")];
    await expect(platformAccess.getPlatformPrincipal(actor)).resolves.toBeNull();
    expect(loggerMock.error).toHaveBeenCalledWith(
      "platform_access.lookup_failed",
      expect.objectContaining({ actorId: actor.id }),
    );
  });
});

describe("permission checks", () => {
  it("allows a permission present in the actor's role", async () => {
    dbMock.state.limitResults = [[{ role: "platform_auditor" }]];
    await expect(
      platformAccess.hasPlatformPermission(actor, "platform.audit.read"),
    ).resolves.toBe(true);
  });

  it("denies and logs a permission absent from the actor's role", async () => {
    dbMock.state.limitResults = [[{ role: "platform_auditor" }]];
    await expect(
      platformAccess.hasPlatformPermission(actor, "platform.agency.update"),
    ).resolves.toBe(false);
    expect(loggerMock.warn).toHaveBeenCalledWith("platform_access.denied", {
      actorId: actor.id,
      permission: "platform.agency.update",
      role: "platform_auditor",
    });
  });

  it("throws a permission-specific error from the required check", async () => {
    dbMock.state.limitResults = [[{ role: "support_operator" }]];
    await expect(
      platformAccess.requirePlatformPermission(actor, "platform.agency.update"),
    ).rejects.toMatchObject({
      action: "platform-permission:platform.agency.update",
    });
  });

  it("returns the principal when the required permission is present", async () => {
    dbMock.state.limitResults = [[{ role: "support_operator" }]];
    const principal = await platformAccess.requirePlatformPermission(
      actor,
      "platform.support.request",
    );
    expect(principal.role).toBe("support_operator");
  });
});
