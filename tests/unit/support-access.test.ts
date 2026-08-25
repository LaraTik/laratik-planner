import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CreateSupportAccessRequestSchema,
  SupportAccessDecisionSchema,
  SupportAccessError,
  SupportAccessErrorCode,
  SupportAccessRequestRow,
  SupportAccessGrantRow,
  SUPPORT_ACCESS_AUTOMATIC_EXPIRY_PENDING_DAYS,
  SUPPORT_ACCESS_DEFAULT_DURATION_HOURS,
  SUPPORT_ACCESS_REQUEST_DURATION_LIMIT_HOURS,
} from "@/lib/support";

/**
 * M3.2 — Support access workflow unit tests.
 *
 * This file tests the parts of the support-access service that
 * are not bound to a real database:
 *
 *   1. Zod schema validation for the request-creation and
 *      decision payloads.
 *   2. Domain error shape: `SupportAccessError` carries a
 *      canonical code and a details object.
 *   3. Constants: the duration cap, the default duration, and
 *      the automatic-expiry window.
 *   4. Row schemas: request and grant rows round-trip through
 *      the Zod parsers with the right field shapes.
 *
 * The DB-bound paths (the actual create/approve/reject/expire
 * flow, the audit-log emission, and the IDOR gate) are covered
 * by the integration suite in `tests/integration/support-access.test.ts`.
 */
describe("M3.2 — support access constants and schemas (unit)", () => {
  it("enforces support request and Owner-only third-party revoke permissions", () => {
    const source = readFileSync(resolve(__dirname, "../../src/lib/support/access.ts"), "utf8");
    expect(source).toContain('requirePlatformPermission(actor, "platform.support.request")');
    expect(source).toContain("hasPlatformPermission(");
    expect(source).toContain('"platform.access.manage"');
    expect(source).not.toContain("const isPlatform = await isPlatformAdmin(actor)");
  });
  it("exposes the documented duration cap, default, and auto-expiry window", () => {
    expect(SUPPORT_ACCESS_REQUEST_DURATION_LIMIT_HOURS).toBe(168);
    expect(SUPPORT_ACCESS_DEFAULT_DURATION_HOURS).toBe(2);
    expect(SUPPORT_ACCESS_AUTOMATIC_EXPIRY_PENDING_DAYS).toBe(7);
  });

  describe("CreateSupportAccessRequestSchema", () => {
    const valid = {
      ticketReference: "SUP-12345",
      reason: "Customer reports failing deliverable upload.",
      targetAgencyId: "11111111-1111-4111-8111-111111111111",
      scopeWorkspaceId: null,
      scopeMetadataOnly: false,
      requestedDurationHours: 4,
      downloadsRequested: false,
    };

    it("accepts the documented happy path", () => {
      const parsed = CreateSupportAccessRequestSchema.parse(valid);
      expect(parsed.ticketReference).toBe("SUP-12345");
      expect(parsed.requestedDurationHours).toBe(4);
      expect(parsed.downloadsRequested).toBe(false);
    });

    it("rejects a duration above the cap", () => {
      const bad = { ...valid, requestedDurationHours: 200 };
      expect(() => CreateSupportAccessRequestSchema.parse(bad)).toThrow();
    });

    it("rejects a duration of zero", () => {
      const bad = { ...valid, requestedDurationHours: 0 };
      expect(() => CreateSupportAccessRequestSchema.parse(bad)).toThrow();
    });

    it("rejects a non-UUID agency id", () => {
      const bad = { ...valid, targetAgencyId: "not-a-uuid" };
      expect(() => CreateSupportAccessRequestSchema.parse(bad)).toThrow();
    });

    it("rejects an empty reason", () => {
      const bad = { ...valid, reason: "" };
      expect(() => CreateSupportAccessRequestSchema.parse(bad)).toThrow();
    });

    it("trims whitespace from the ticket reference and reason", () => {
      const parsed = CreateSupportAccessRequestSchema.parse({
        ...valid,
        ticketReference: "  SUP-12345  ",
        reason: "  Customer reports failing deliverable upload.  ",
      });
      expect(parsed.ticketReference).toBe("SUP-12345");
      expect(parsed.reason).toBe("Customer reports failing deliverable upload.");
    });

    it("applies the documented defaults for optional fields", () => {
      const minimal = {
        ticketReference: "SUP-99",
        reason: "Need to read delivery file metadata for incident review.",
        targetAgencyId: valid.targetAgencyId,
        requestedDurationHours: 1,
      };
      const parsed = CreateSupportAccessRequestSchema.parse(minimal);
      expect(parsed.scopeMetadataOnly).toBe(false);
      expect(parsed.downloadsRequested).toBe(false);
    });

    it("accepts a workspace-scoped request", () => {
      const parsed = CreateSupportAccessRequestSchema.parse({
        ...valid,
        scopeWorkspaceId: "22222222-2222-4222-8222-222222222222",
      });
      expect(parsed.scopeWorkspaceId).toBe("22222222-2222-4222-8222-222222222222");
    });
  });

  describe("SupportAccessDecisionSchema", () => {
    it("accepts a reason with the right shape", () => {
      const parsed = SupportAccessDecisionSchema.parse({ reason: "Verified the incident." });
      expect(parsed.reason).toBe("Verified the incident.");
      expect(parsed.grantDownloads).toBe(false);
    });

    it("rejects an empty reason", () => {
      expect(() => SupportAccessDecisionSchema.parse({ reason: "" })).toThrow();
    });
  });

  describe("SupportAccessError", () => {
    it("carries the documented code, message, and details bag", () => {
      const err = new SupportAccessError(
        SupportAccessErrorCode.AlreadyDecided,
        "Request is already in 'approved' state.",
        { requestId: "abc", currentStatus: "approved" },
      );
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("SupportAccessError");
      expect(err.code).toBe("support.already-decided");
      expect(err.message).toContain("approved");
      expect(err.details).toEqual({ requestId: "abc", currentStatus: "approved" });
    });

    it("defaults the details bag to an empty object", () => {
      const err = new SupportAccessError(SupportAccessErrorCode.NotFound, "missing");
      expect(err.details).toEqual({});
    });
  });

  describe("row schemas", () => {
    it("round-trips a request row", () => {
      const row = SupportAccessRequestRow.parse({
        id: "11111111-1111-4111-8111-111111111111",
        ticketReference: "SUP-1",
        reason: "Investigating a customer report.",
        targetAgencyId: "22222222-2222-4222-8222-222222222222",
        scopeWorkspaceId: null,
        scopeMetadataOnly: true,
        requestedDurationHours: 2,
        downloadsRequested: false,
        status: "pending",
        requestedByUserId: "33333333-3333-4333-8333-333333333333",
        approvedByUserId: null,
        decidedAt: null,
        decisionReason: null,
        createdAt: new Date("2026-08-24T08:00:00Z"),
        updatedAt: new Date("2026-08-24T08:00:00Z"),
      });
      expect(row.status).toBe("pending");
      expect(row.scopeMetadataOnly).toBe(true);
    });

    it("round-trips a grant row", () => {
      const now = new Date("2026-08-24T08:00:00Z");
      const expires = new Date("2026-08-24T10:00:00Z");
      const row = SupportAccessGrantRow.parse({
        id: "44444444-4444-4444-8444-444444444444",
        requestId: "55555555-5555-4555-8555-555555555555",
        targetAgencyId: "22222222-2222-4222-8222-222222222222",
        scopeWorkspaceId: null,
        scopeMetadataOnly: false,
        downloadsAllowed: false,
        approvedByUserId: "33333333-3333-4333-8333-333333333333",
        grantedToUserId: "66666666-6666-4666-8666-666666666666",
        activatedAt: now,
        expiresAt: expires,
        revokedAt: null,
        revokedByUserId: null,
        revokedReason: null,
        createdAt: now,
        updatedAt: now,
      });
      expect(row.downloadsAllowed).toBe(false);
      expect(row.expiresAt.getTime()).toBeGreaterThan(row.activatedAt.getTime());
    });
  });
});
