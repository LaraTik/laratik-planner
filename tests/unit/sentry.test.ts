import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Sentry wrapper is env-gated: with no SENTRY_DSN, every call is a
 * no-op and the SDK is never loaded. This test verifies the gating
 * works without requiring the SDK to be installed or configured.
 */
describe("sentry wrapper (Goal 13)", () => {
  const ORIGINAL_DSN = process.env["SENTRY_DSN"];

  beforeEach(() => {
    delete process.env["SENTRY_DSN"];
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL_DSN) process.env["SENTRY_DSN"] = ORIGINAL_DSN;
  });

  it("isEnabled() returns false when SENTRY_DSN is unset", async () => {
    const sentry = await import("@/lib/observability/sentry");
    expect(sentry.isEnabled()).toBe(false);
  });

  it("captureException is a no-op when SENTRY_DSN is unset", async () => {
    const sentry = await import("@/lib/observability/sentry");
    expect(() => sentry.captureException(new Error("test"))).not.toThrow();
    expect(() => sentry.captureException(new Error("test"), { foo: "bar" })).not.toThrow();
  });

  it("captureMessage is a no-op when SENTRY_DSN is unset", async () => {
    const sentry = await import("@/lib/observability/sentry");
    expect(() => sentry.captureMessage("hello")).not.toThrow();
    expect(() => sentry.captureMessage("warn", "warning")).not.toThrow();
  });

  it("setUser is a no-op when SENTRY_DSN is unset", async () => {
    const sentry = await import("@/lib/observability/sentry");
    expect(() => sentry.setUser({ id: "u1", email: "a@b.c" })).not.toThrow();
    expect(() => sentry.setUser(null)).not.toThrow();
  });
});
