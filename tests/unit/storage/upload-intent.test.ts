import { describe, expect, it } from "vitest";
import {
  assertUploadIntentTransition,
  isUploadIntentExpired,
  type UploadIntentStatus,
} from "@/lib/storage/upload-intent";

describe("upload-intent state machine", () => {
  it.each<[UploadIntentStatus, UploadIntentStatus]>([
    ["reserved", "uploaded"],
    ["reserved", "failed"],
    ["reserved", "expired"],
    ["reserved", "aborted"],
    ["uploaded", "completed"],
    ["uploaded", "failed"],
  ])("allows %s -> %s", (from, to) => {
    expect(() => assertUploadIntentTransition(from, to)).not.toThrow();
  });

  it.each<[UploadIntentStatus, UploadIntentStatus]>([
    ["completed", "reserved"],
    ["completed", "failed"],
    ["failed", "completed"],
    ["expired", "completed"],
  ])("rejects %s -> %s", (from, to) => {
    expect(() => assertUploadIntentTransition(from, to)).toThrow();
  });

  it("expires only when the intent deadline has passed", () => {
    const now = new Date("2026-09-06T12:00:00Z");
    expect(isUploadIntentExpired(new Date("2026-09-06T11:59:59Z"), now)).toBe(true);
    expect(isUploadIntentExpired(new Date("2026-09-06T12:00:00Z"), now)).toBe(false);
  });
});
