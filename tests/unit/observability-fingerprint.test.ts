import { describe, expect, it } from "vitest";
import { fingerprintFor, normalizeErrorMessage } from "@/lib/observability/fingerprint";

describe("normalizeErrorMessage", () => {
  it("collapses UUIDs", () => {
    expect(normalizeErrorMessage("workspace 7c9e6679-7425-40de-944b-e07fc1f90ae7 not found")).toBe(
      "workspace <id> not found",
    );
  });

  it("collapses long hex runs (digests)", () => {
    expect(normalizeErrorMessage("digest deadbeefcafe1234 could not be resolved")).toBe(
      "digest <id> could not be resolved",
    );
  });

  it("collapses bare digit runs", () => {
    expect(normalizeErrorMessage("row 41 failed after 3 retries in 1250ms")).toBe(
      "row # failed after # retries in #ms",
    );
  });

  it("preserves a quoted identifier so two constraint bugs stay separate", () => {
    const a = normalizeErrorMessage(
      'duplicate key value violates unique constraint "users_email_key"',
    );
    const b = normalizeErrorMessage(
      'duplicate key value violates unique constraint "workspaces_slug_key"',
    );
    expect(a).toContain("users_email_key");
    expect(a).not.toBe(b);
  });

  it("collapses a quoted value so varying data groups together", () => {
    const a = normalizeErrorMessage('Workspace "Acme Corporation Ltd" not found');
    const b = normalizeErrorMessage('Workspace "Globex Industries" not found');
    expect(a).toBe(b);
    expect(a).toContain("<str>");
  });

  it("collapses quoted values containing digits", () => {
    expect(normalizeErrorMessage('no agency named "Agency 42"')).toBe(
      normalizeErrorMessage('no agency named "Agency 99"'),
    );
  });

  it("collapses whitespace", () => {
    expect(normalizeErrorMessage("  boom   \n  happened  ")).toBe("boom happened");
  });

  it("handles the empty string", () => {
    expect(normalizeErrorMessage("")).toBe("");
  });
});

describe("fingerprintFor", () => {
  it("is stable for the same error", () => {
    const a = fingerprintFor("Error", "boom", "/app/x");
    const b = fingerprintFor("Error", "boom", "/app/x");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });

  it("groups the same bug across varying row ids and retry counts", () => {
    const a = fingerprintFor(
      "PostgresError",
      "Key (id)=(7c9e6679-7425-40de-944b-e07fc1f90ae7) not found after 3 retries",
      "/api/x",
    );
    const b = fingerprintFor(
      "PostgresError",
      "Key (id)=(11112222-3333-4444-5555-666677778888) not found after 9 retries",
      "/api/x",
    );
    expect(a).toBe(b);
  });

  it("still separates two errors that differ only by a hex-shaped value's length", () => {
    // A short hex token is not collapsed, so a genuinely different id
    // shape does not silently merge into the same group.
    expect(normalizeErrorMessage("id abcd not found")).toBe("id abcd not found");
    expect(normalizeErrorMessage("id deadbeefcafe1234 not found")).toBe("id <id> not found");
  });

  it("separates the same message on different routes", () => {
    expect(fingerprintFor("Error", "boom", "/api/a")).not.toBe(
      fingerprintFor("Error", "boom", "/api/b"),
    );
  });

  it("separates different error classes with the same message", () => {
    expect(fingerprintFor("TypeError", "boom", "/api/a")).not.toBe(
      fingerprintFor("ZodError", "boom", "/api/a"),
    );
  });

  it("separates two constraint violations with the same shape", () => {
    expect(
      fingerprintFor("PostgresError", 'violates unique constraint "users_email_key"', "/api/a"),
    ).not.toBe(
      fingerprintFor("PostgresError", 'violates unique constraint "workspaces_slug_key"', "/api/a"),
    );
  });

  it("tolerates a missing error name and route", () => {
    const fp = fingerprintFor(undefined, "boom", "");
    expect(fp).toMatch(/^[0-9a-f]{12}$/);
    expect(fingerprintFor(undefined, "boom", "")).toBe(fp);
  });
});
