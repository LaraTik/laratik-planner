/**
 * Unit: password sign-in classification.
 *
 * Regression contract for the bug where every password failure surfaced
 * as one message — "That email or password is wrong" — which told an
 * account with NO password to retry a password they were never issued.
 * `precheckPasswordSignIn` must separate the three refusals.
 *
 * We assert on the outcome tags, not on the messages: the copy lives in
 * the i18n catalogs and is covered by the catalog parity test, while the
 * decision of *which* refusal to raise is this module's contract.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

/** Rows the mocked `db.select(...).from(...).where(...).limit(1)` resolves to. */
const { selectRows } = vi.hoisted(() => ({ selectRows: [] as unknown[] }));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectRows),
        }),
      }),
    }),
  },
}));

// Imported after the mock so the module resolves the mocked `db`.
const { precheckPasswordSignIn, hashPassword } = await import("@/lib/auth/password");

describe("precheckPasswordSignIn", () => {
  beforeEach(() => {
    selectRows.length = 0;
  });

  it("reports unknown_account when no row matches the email", async () => {
    selectRows.length = 0;
    const result = await precheckPasswordSignIn("nobody@laratik.local", "whatever");
    expect(result).toEqual({ outcome: "unknown_account" });
  });

  it("reports no_password when the account exists but has no password hash", async () => {
    // The case the old code swallowed: a Google / magic-link account.
    selectRows.push({ id: "u1", passwordHash: null });
    const result = await precheckPasswordSignIn("oauth@laratik.local", "whatever");
    expect(result).toEqual({ outcome: "no_password" });
  });

  it("reports wrong_password when the hash exists but does not match", async () => {
    const real = await hashPassword("correct-horse-battery");
    selectRows.push({ id: "u1", passwordHash: real });
    const result = await precheckPasswordSignIn("user@laratik.local", "wrong");
    expect(result).toEqual({ outcome: "wrong_password" });
  });

  it("reports can_sign_in for a matching password", async () => {
    const real = await hashPassword("correct-horse-battery");
    selectRows.push({ id: "u1", passwordHash: real });
    const result = await precheckPasswordSignIn("user@laratik.local", "correct-horse-battery");
    expect(result).toEqual({ outcome: "can_sign_in" });
  });

  it("normalises the email before matching (case + surrounding space)", async () => {
    const real = await hashPassword("pw");
    selectRows.push({ id: "u1", passwordHash: real });
    await expect(precheckPasswordSignIn("  MiXeD@Laratik.Local ", "pw")).resolves.toEqual({
      outcome: "can_sign_in",
    });
  });

  it("does not accept a blank password for an account that has a hash", async () => {
    const real = await hashPassword("correct-horse-battery");
    selectRows.push({ id: "u1", passwordHash: real });
    const result = await precheckPasswordSignIn("user@laratik.local", "");
    expect(result).toEqual({ outcome: "wrong_password" });
  });

  /**
   * The messages deliberately distinguish "no such account" from "wrong
   * password", which is the requested product behaviour for an
   * invite-only tool. That split must not be handed out again for free
   * through the stopwatch: an absent row and a NULL `password_hash`
   * would otherwise return in ~1ms while a real mismatch pays bcrypt,
   * which is a cheaper oracle than reading the message.
   *
   * This asserts the *observable* consequence rather than "a hash was
   * generated": all three refusals must take comparable wall time.
   */
  it("keeps the three refusals comparable in cost (no timing oracle)", async () => {
    const real = await hashPassword("correct-horse-battery");

    const time = async (email: string, password: string) => {
      const start = process.hrtime.bigint();
      await precheckPasswordSignIn(email, password);
      return Number(process.hrtime.bigint() - start) / 1e6;
    };

    selectRows.push({ id: "u1", passwordHash: real });
    const wrongMs = await time("user@laratik.local", "wrong");

    selectRows.length = 0;
    const unknownMs = await time("nobody@laratik.local", "wrong");

    selectRows.push({ id: "u1", passwordHash: null });
    const noPasswordMs = await time("oauth@laratik.local", "wrong");

    // A missing row or a NULL hash must not be ~100x cheaper than a real
    // comparison. 5x of slack absorbs CI scheduling noise while still
    // failing if the dummy-hash path is deleted.
    expect(unknownMs).toBeGreaterThan(wrongMs / 5);
    expect(noPasswordMs).toBeGreaterThan(wrongMs / 5);
  });
});
