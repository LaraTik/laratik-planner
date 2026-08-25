import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for `src/lib/agencies/command.ts` (M3.4 — agency CRUD).
 *
 * The contract is:
 *   - `updateAgency(actor, agencyId, input)` is the only writer
 *     for `name / slug / locale / timezone`. It is policy-gated
 *     (the actor must be an agency admin of the agency).
 *   - Slug uniqueness is re-checked inside the transaction. A
 *     collision throws `AgencyUpdateError` with code
 *     `SlugConflict`.
 *   - Every successful update appends a row to
 *     `security_audit_events` with `action = "agency.update"` and
 *     a `metadata` jsonb that carries the changed fields.
 *   - The IANA timezone is validated via `Intl.DateTimeFormat`.
 *   - The locale is validated as a BCP 47 language tag.
 *
 * DB is mocked at the chainable Drizzle surface; the policy
 * module is partially stubbed (`isAgencyAdmin` is flipped via
 * `policyOverrides`).
 */

vi.mock("server-only", () => ({}));

type DrizzleState = {
  selectResults: unknown[][];
  updateCalls: { set: unknown; where: unknown }[];
  insertCalls: { values: unknown }[];
};

function dequeue(state: DrizzleState): unknown[] {
  return state.selectResults.shift() ?? [];
}

function makeDrizzleMock(state: DrizzleState) {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(dequeue(state)));
    chain.for = vi.fn(() => chain);
    const thenable = (next: () => Record<string, unknown>) =>
      new Proxy(next(), {
        get(target, prop, receiver) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => resolve(dequeue(state));
          }
          if (prop === "limit") return target.limit;
          if (prop === "for") return target.for;
          return Reflect.get(target, prop, receiver);
        },
      });
    chain.where = vi.fn(() => thenable(() => chain));
    return chain;
  }
  const chain = makeChain();
  const select = vi.fn(() => chain);

  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((values: unknown) => {
    state.insertCalls.push({ values });
    return Promise.resolve();
  });
  const insert = vi.fn(() => insertChain);

  const updateChain: Record<string, unknown> = {};
  let lastSet: unknown = undefined;
  updateChain.set = vi.fn((set: unknown) => {
    lastSet = set;
    return updateChain;
  });
  updateChain.where = vi.fn((where: unknown) => {
    state.updateCalls.push({ set: lastSet, where });
    lastSet = undefined;
    return Promise.resolve();
  });
  const update = vi.fn(() => updateChain);

  const transaction = vi.fn(async (cb: (tx: typeof dbMock) => unknown) => cb(dbMock));
  return { select, insert, update, transaction, state };
}

const dbMock = vi.hoisted(() =>
  makeDrizzleMock({
    selectResults: [],
    updateCalls: [],
    insertCalls: [],
  }),
);

vi.mock("@/lib/db", () => ({
  db: {
    ...dbMock,
    transaction: (...args: unknown[]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (dbMock.transaction as any)(...args),
  },
}));

const policyOverrides = vi.hoisted(() => ({
  isAgencyAdminResult: true as boolean,
}));

vi.mock("@/lib/auth/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/policy")>("@/lib/auth/policy");
  return {
    ...actual,
    isAgencyAdmin: vi.fn(async () => policyOverrides.isAgencyAdminResult),
  };
});

const platformAccessMock = vi.hoisted(() => ({ requirePermission: vi.fn() }));

vi.mock("@/lib/auth/platform-access", () => ({
  requirePlatformPermission: platformAccessMock.requirePermission,
}));

const {
  updateAgency,
  updateAgencyAsPlatform,
  UpdateAgencySchema,
  AgencyUpdateError,
  AGENCY_UPDATE_ERROR_CODES,
} = await import("@/lib/agencies/command");

const AGENCY_ID = "00000000-0000-4000-8000-00000000a201";
const ACTOR_ID = "00000000-0000-4000-8000-00000000a202";
const OTHER_AGENCY_ID = "00000000-0000-4000-8000-00000000a203";

const actor = { id: ACTOR_ID };

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.state.updateCalls = [];
  dbMock.state.insertCalls = [];
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  dbMock.update.mockClear();
  dbMock.transaction.mockClear();
  policyOverrides.isAgencyAdminResult = true;
  platformAccessMock.requirePermission.mockReset();
  platformAccessMock.requirePermission.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UpdateAgencySchema", () => {
  it("accepts a valid identity update", () => {
    const parsed = UpdateAgencySchema.parse({
      name: "LaraTik Studio",
      slug: "laratik-studio",
      locale: "en",
      timezone: "Europe/Berlin",
    });
    expect(parsed.name).toBe("LaraTik Studio");
    expect(parsed.slug).toBe("laratik-studio");
    expect(parsed.timezone).toBe("Europe/Berlin");
  });

  it("rejects a name shorter than 2 chars", () => {
    expect(() =>
      UpdateAgencySchema.parse({ name: "A", slug: "acme", locale: "en", timezone: "UTC" }),
    ).toThrow();
  });

  it("normalizes a slug with uppercase letters to lowercase", () => {
    const parsed = UpdateAgencySchema.parse({
      name: "Acme",
      slug: "ACME",
      locale: "en",
      timezone: "UTC",
    });
    // The schema is forgiving on case to match the create-time
    // regex; the server normalizes to lowercase.
    expect(parsed.slug).toBe("acme");
  });

  it("rejects a slug that starts with a hyphen", () => {
    expect(() =>
      UpdateAgencySchema.parse({
        name: "Acme",
        slug: "-acme",
        locale: "en",
        timezone: "UTC",
      }),
    ).toThrow();
  });

  it("rejects an unknown timezone", () => {
    expect(() =>
      UpdateAgencySchema.parse({
        name: "Acme",
        slug: "acme",
        locale: "en",
        timezone: "Not/A/Zone",
      }),
    ).toThrow(/Timezone must be a valid IANA/);
  });

  it("accepts a BCP 47 locale with a region subtag", () => {
    const parsed = UpdateAgencySchema.parse({
      name: "Acme",
      slug: "acme",
      locale: "pt-BR",
      timezone: "UTC",
    });
    expect(parsed.locale).toBe("pt-BR");
  });

  it("rejects a malformed locale", () => {
    expect(() =>
      UpdateAgencySchema.parse({
        name: "Acme",
        slug: "acme",
        locale: "x",
        timezone: "UTC",
      }),
    ).toThrow();
  });
});

describe("updateAgency", () => {
  it("rejects when the actor is not an agency admin", async () => {
    policyOverrides.isAgencyAdminResult = false;
    const { PermissionDeniedError } = await import("@/lib/auth/policy");
    await expect(
      updateAgency(actor, AGENCY_ID, {
        name: "LaraTik",
        slug: "laratik",
        locale: "en",
        timezone: "UTC",
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("throws NotFound when the agency does not exist", async () => {
    dbMock.state.selectResults.push([]); // no row
    try {
      await updateAgency(actor, AGENCY_ID, {
        name: "LaraTik",
        slug: "laratik",
        locale: "en",
        timezone: "UTC",
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AgencyUpdateError);
      expect((e as InstanceType<typeof AgencyUpdateError>).code).toBe(
        AGENCY_UPDATE_ERROR_CODES.NotFound,
      );
    }
  });

  it("throws SlugConflict when the new slug collides with another agency", async () => {
    dbMock.state.selectResults.push([
      {
        id: AGENCY_ID,
        name: "LaraTik",
        slug: "laratik",
        locale: "en",
        timezone: "UTC",
      },
    ]);
    dbMock.state.selectResults.push([{ id: OTHER_AGENCY_ID }]); // collision
    try {
      await updateAgency(actor, AGENCY_ID, {
        name: "LaraTik Studio",
        slug: "laratik-studio",
        locale: "en",
        timezone: "UTC",
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AgencyUpdateError);
      expect((e as InstanceType<typeof AgencyUpdateError>).code).toBe(
        AGENCY_UPDATE_ERROR_CODES.SlugConflict,
      );
    }
  });

  it("skips the slug-uniqueness check when the slug is unchanged", async () => {
    dbMock.state.selectResults.push([
      { id: AGENCY_ID, name: "Old", slug: "laratik", locale: "en", timezone: "UTC" },
    ]);
    const result = await updateAgency(actor, AGENCY_ID, {
      name: "New Name",
      slug: "laratik", // unchanged
      locale: "en",
      timezone: "UTC",
    });
    expect(result.changedFields).toContain("name");
    expect(result.changedFields).not.toContain("slug");
  });

  it("writes the updated columns and appends a security audit row with before/after", async () => {
    dbMock.state.selectResults.push([
      { id: AGENCY_ID, name: "Old", slug: "laratik", locale: "en", timezone: "UTC" },
    ]);
    const result = await updateAgency(actor, AGENCY_ID, {
      name: "LaraTik Studio",
      slug: "laratik-studio",
      locale: "pt-BR",
      timezone: "Europe/Berlin",
    });
    expect(result.agencyId).toBe(AGENCY_ID);
    expect(result.changedFields).toEqual(
      expect.arrayContaining(["name", "slug", "locale", "timezone"]),
    );

    // The update call carries all four fields + updatedAt.
    expect(dbMock.update).toHaveBeenCalledTimes(1);
    const set = dbMock.state.updateCalls[0]?.set;
    expect(set).toMatchObject({
      name: "LaraTik Studio",
      slug: "laratik-studio",
      locale: "pt-BR",
      timezone: "Europe/Berlin",
    });
    expect(set).toHaveProperty("updatedAt");

    // Audit row carries before / after + changedFields.
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    const auditValues = dbMock.state.insertCalls[0]?.values;
    expect(auditValues).toMatchObject({
      actorId: ACTOR_ID,
      action: "agency.update",
      targetType: "agency",
      targetId: AGENCY_ID,
      outcome: "success",
    });
    const metadata = (
      auditValues as {
        metadata: {
          changedFields: string[];
          before: Record<string, unknown>;
          after: Record<string, unknown>;
          authorityScope: string;
        };
      }
    ).metadata;
    expect(metadata.changedFields).toEqual(
      expect.arrayContaining(["name", "slug", "locale", "timezone"]),
    );
    expect(metadata.before).toMatchObject({ name: "Old", slug: "laratik" });
    expect(metadata.after).toMatchObject({
      name: "LaraTik Studio",
      slug: "laratik-studio",
    });
    expect(metadata.authorityScope).toBe("agency");
  });

  it("does not write a security audit row when nothing changed", async () => {
    dbMock.state.selectResults.push([
      {
        id: AGENCY_ID,
        name: "LaraTik",
        slug: "laratik",
        locale: "en",
        timezone: "UTC",
      },
    ]);
    const result = await updateAgency(actor, AGENCY_ID, {
      name: "LaraTik",
      slug: "laratik",
      locale: "en",
      timezone: "UTC",
    });
    expect(result.changedFields).toEqual([]);
    // No audit row when nothing changed (a rename with no
    // effective delta is a no-op audit-wise).
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});

describe("updateAgencyAsPlatform", () => {
  it("updates an agency without tenant membership and records platform authority", async () => {
    policyOverrides.isAgencyAdminResult = false;
    dbMock.state.selectResults.push([
      { id: AGENCY_ID, name: "Old", slug: "laratik", locale: "en", timezone: "UTC" },
    ]);

    const result = await updateAgencyAsPlatform(actor, AGENCY_ID, {
      name: "New platform name",
      slug: "laratik",
      locale: "en",
      timezone: "UTC",
    });

    expect(platformAccessMock.requirePermission).toHaveBeenCalledWith(
      actor,
      "platform.agency.update",
    );
    expect(result.changedFields).toEqual(["name"]);
    expect(dbMock.state.insertCalls).toHaveLength(1);
    expect(dbMock.state.insertCalls[0]?.values).toMatchObject({
      metadata: { authorityScope: "platform" },
    });
  });
});
