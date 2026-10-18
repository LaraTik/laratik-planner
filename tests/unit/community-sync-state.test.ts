import { describe, expect, it } from "vitest";
import { advanceSyncCursor, type CommunitySyncKind } from "@/lib/community/sync-state";

describe("community sync cursors", () => {
  it.each<CommunitySyncKind>(["comments", "private_messages"])(
    "keeps a %s cursor monotonic across overlapping reads",
    (kind) => {
      expect(
        advanceSyncCursor(kind, "2026-10-18T12:00:00.000Z", [new Date("2026-10-18T11:59:00.000Z")]),
      ).toBe("2026-10-18T12:00:00.000Z");
      expect(
        advanceSyncCursor(kind, "2026-10-18T12:00:00.000Z", [
          new Date("2026-10-18T12:03:00.000Z"),
          new Date("2026-10-18T12:01:00.000Z"),
        ]),
      ).toBe("2026-10-18T12:03:00.000Z");
    },
  );

  it("keeps the previous cursor when an overlapping read has no messages", () => {
    expect(advanceSyncCursor("comments", "2026-10-18T12:00:00.000Z", [])).toBe(
      "2026-10-18T12:00:00.000Z",
    );
  });

  it("ignores an invalid stored cursor", () => {
    expect(
      advanceSyncCursor("private_messages", "not-a-date", [new Date("2026-10-18T12:03:00Z")]),
    ).toBe("2026-10-18T12:03:00.000Z");
  });
});
