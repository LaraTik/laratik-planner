import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Own-profile helpers — exercise updateOwnProfile, changeOwnPassword,
 * and getPasswordState. The DB boundary is mocked the same way as
 * auth-password-hash.test.ts. We do NOT exercise the success paths
 * that require bcrypt; those are covered by the integration suite.
 */

type DrizzleState = {
  selectResults: unknown[][];
  updateResults: unknown[][];
  updateCalls: { set: unknown; where: unknown }[];
};

function makeDrizzleMock(state: DrizzleState) {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(() => {
      const rows = state.selectResults.shift() ?? [];
      return Promise.resolve(rows);
    });
    return chain;
  }
  const chain = makeChain();
  const select = vi.fn(() => chain);

  const updateChain: Record<string, unknown> = {};
  let lastSet: unknown = undefined;
  updateChain.set = vi.fn((set: unknown) => {
    lastSet = set;
    return updateChain;
  });
  updateChain.where = vi.fn((_where: unknown) => {
    state.updateCalls.push({ set: lastSet, where: _where });
    lastSet = undefined;
    return updateChain;
  });
  updateChain.returning = vi.fn(() => {
    const rows = state.updateResults.shift() ?? [{ id: "u-1" }];
    return Promise.resolve(rows);
  });
  const update = vi.fn(() => updateChain);

  return { select, update, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleState = {
    selectResults: [],
    updateResults: [],
    updateCalls: [],
  };
  return makeDrizzleMock(state);
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

const { updateOwnProfile, changeOwnPassword, getPasswordState } =
  await import("@/lib/auth/profile");

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.state.updateResults = [];
  dbMock.state.updateCalls = [];
});

describe("updateOwnProfile", () => {
  it("rejects an empty display name with field=displayName", async () => {
    const out = await updateOwnProfile("u-1", {
      displayName: "   ",
      name: "Alice",
      image: "",
      locale: "en",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.field).toBe("displayName");
    }
  });

  it("rejects a non-URL avatar", async () => {
    const out = await updateOwnProfile("u-1", {
      displayName: "Alice",
      name: "Alice",
      image: "not-a-url",
      locale: "en",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.field).toBe("image");
    }
  });

  it("rejects an unknown locale", async () => {
    const out = await updateOwnProfile("u-1", {
      displayName: "Alice",
      name: "Alice",
      image: "",
      locale: "de" as never,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.field).toBe("locale");
    }
  });

  it("rejects a too-long display name", async () => {
    const out = await updateOwnProfile("u-1", {
      displayName: "a".repeat(81),
      name: "a",
      image: "",
      locale: "en",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.field).toBe("displayName");
    }
  });

  it("updates the user row and returns ok on valid input", async () => {
    dbMock.state.updateResults = [[{ id: "u-1" }]];
    const out = await updateOwnProfile("u-1", {
      displayName: "Alice",
      name: "Alice Smith",
      image: "https://example.com/a.png",
      locale: "en",
    });
    expect(out).toEqual({ ok: true });
    expect(dbMock.state.updateCalls).toHaveLength(1);
    const set = dbMock.state.updateCalls[0]?.set as Record<string, unknown>;
    expect(set["displayName"]).toBe("Alice");
    expect(set["name"]).toBe("Alice Smith");
    expect(set["image"]).toBe("https://example.com/a.png");
    expect(set["locale"]).toBe("en");
    expect(set["updatedAt"]).toBeInstanceOf(Date);
  });

  it("stores null image when omitted, derives name from displayName", async () => {
    dbMock.state.updateResults = [[{ id: "u-1" }]];
    const out = await updateOwnProfile("u-1", {
      displayName: "Bob",
      name: "",
      image: "",
      locale: "en",
    });
    expect(out).toEqual({ ok: true });
    const set = dbMock.state.updateCalls[0]?.set as Record<string, unknown>;
    expect(set["image"]).toBeNull();
    expect(set["name"]).toBe("Bob");
  });

  it("returns not_found when the row no longer exists", async () => {
    dbMock.state.updateResults = [[]];
    const out = await updateOwnProfile("u-gone", {
      displayName: "Alice",
      name: "Alice",
      image: "",
      locale: "en",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("not_found");
    }
  });
});

describe("changeOwnPassword", () => {
  it("rejects a weak new password", async () => {
    const out = await changeOwnPassword("u-1", {
      current: "oldoldold1",
      next: "weak",
      confirm: "weak",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("weak");
    }
  });

  it("rejects when the new and confirm do not match", async () => {
    const out = await changeOwnPassword("u-1", {
      current: "oldoldold1",
      next: "hunter22",
      confirm: "hunter23",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("mismatch");
    }
  });

  it("requires the current password when one is stored", async () => {
    dbMock.state.selectResults = [[{ id: "u-1", passwordHash: "$2a$12$" + "x".repeat(53) }]];
    const out = await changeOwnPassword("u-1", {
      current: "wrong-old1",
      next: "hunter22",
      confirm: "hunter22",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("current_wrong");
    }
  });

  it("rejects an empty current password when one is stored", async () => {
    dbMock.state.selectResults = [[{ id: "u-1", passwordHash: "$2a$12$" + "x".repeat(53) }]];
    const out = await changeOwnPassword("u-1", {
      current: "",
      next: "hunter22",
      confirm: "hunter22",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("current_wrong");
      expect(out.code).toBe("currentPasswordRequired");
    }
  });

  it("returns not_found when the user row has vanished", async () => {
    dbMock.state.selectResults = [[]];
    const out = await changeOwnPassword("u-gone", {
      current: "",
      next: "hunter22",
      confirm: "hunter22",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("not_found");
    }
  });

  it("skips the current-password check when no hash is stored (OAuth user) and updates", async () => {
    dbMock.state.selectResults = [[{ id: "u-1", passwordHash: null }]];
    dbMock.state.updateResults = [[]];
    const out = await changeOwnPassword("u-1", {
      current: "",
      next: "hunter22",
      confirm: "hunter22",
    });
    expect(out).toEqual({ ok: true, mode: "set" });
  });

  it("updates the password when the current one verifies and reports mode=change", async () => {
    // bcrypt hash for "oldoldold1" at cost 12
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("oldoldold1", 12);
    dbMock.state.selectResults = [[{ id: "u-1", passwordHash: hash }]];
    dbMock.state.updateResults = [[]];
    const out = await changeOwnPassword("u-1", {
      current: "oldoldold1",
      next: "newnewnew1",
      confirm: "newnewnew1",
    });
    expect(out).toEqual({ ok: true, mode: "change" });
  });
});

describe("getPasswordState", () => {
  it("returns hasPassword=true when the user has a hash", async () => {
    dbMock.state.selectResults = [[{ passwordHash: "h" }]];
    await expect(getPasswordState("u-1")).resolves.toEqual({ hasPassword: true });
  });

  it("returns hasPassword=false when the hash is null", async () => {
    dbMock.state.selectResults = [[{ passwordHash: null }]];
    await expect(getPasswordState("u-1")).resolves.toEqual({ hasPassword: false });
  });

  it("returns null when the user does not exist", async () => {
    dbMock.state.selectResults = [[]];
    await expect(getPasswordState("u-gone")).resolves.toBeNull();
  });
});
