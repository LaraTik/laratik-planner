import { describe, expect, it } from "vitest";
import { decodeContentCursor, encodeContentCursor } from "@/lib/content/service";

/**
 * FEAT-09 (GAP-FULL-REVIEW-2026-08-25) — the planning list "load more"
 * button encodes the next-page cursor as a base64url JSON tuple. The
 * round-trip must be lossless for any (plannedPublishAt, id) pair the
 * page could hand us, and any garbage input (stale bookmark, manual
 * URL edit) must decode to `undefined` instead of throwing — a 500
 * from a bad cursor would be a worse UX than re-paging from the start.
 */
describe("content cursor", () => {
  it("round-trips a typical cursor", () => {
    const original = {
      plannedPublishAt: new Date("2026-09-12T15:30:00.000Z"),
      id: "f3e1c2b1-1234-4abc-9def-0a1b2c3d4e5f",
    };
    const encoded = encodeContentCursor(original);
    const decoded = decodeContentCursor(encoded);
    expect(decoded).toBeDefined();
    expect(decoded!.id).toBe(original.id);
    expect(decoded!.plannedPublishAt.toISOString()).toBe(original.plannedPublishAt.toISOString());
  });

  it("returns undefined for null, undefined, or empty input", () => {
    expect(decodeContentCursor(undefined)).toBeUndefined();
    expect(decodeContentCursor(null)).toBeUndefined();
    expect(decodeContentCursor("")).toBeUndefined();
  });

  it("returns undefined for an invalid base64 payload instead of throwing", () => {
    expect(decodeContentCursor("!!!not-base64!!!")).toBeUndefined();
    expect(decodeContentCursor("not-json")).toBeUndefined();
  });

  it("returns undefined when the payload is missing a required field", () => {
    const missingId = Buffer.from(
      JSON.stringify({ plannedPublishAt: "2026-09-12T15:30:00.000Z" }),
      "utf8",
    ).toString("base64url");
    expect(decodeContentCursor(missingId)).toBeUndefined();
    const missingDate = Buffer.from(JSON.stringify({ id: "abc" }), "utf8").toString("base64url");
    expect(decodeContentCursor(missingDate)).toBeUndefined();
  });

  it("returns undefined when the date is unparseable", () => {
    const bad = Buffer.from(
      JSON.stringify({ plannedPublishAt: "not-a-date", id: "abc" }),
      "utf8",
    ).toString("base64url");
    expect(decodeContentCursor(bad)).toBeUndefined();
  });
});
