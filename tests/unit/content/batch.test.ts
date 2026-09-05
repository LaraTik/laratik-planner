import { describe, expect, it } from "vitest";
import {
  formatBatchDateTimeForInput,
  parseBatchDateTime,
  parseBatchRow,
  parseBatchRows,
  parseSpreadsheetRows,
} from "@/lib/content/batch";

describe("content/batch", () => {
  it("parses legacy rows and normalizes documented format aliases", () => {
    const out = parseBatchRow(
      "Spring collection | image | 2026-09-05 09:00 | Pre-order announcement",
    );
    expect(out.format).toBe("static_post");
    expect(out.issues).toEqual([]);
  });

  it("keeps optional caption, hashtags, and location extensions", () => {
    const out = parseBatchRow(
      "Spring drop | static_post | 2026-09-05T09:00:00Z | The reveal | Pre-order | #spring #drop | Dubai Mall|fb-123",
    );
    expect(out.extensions).toEqual({
      caption: "Pre-order",
      hashtags: ["#spring", "#drop"],
      location: { name: "Dubai Mall", externalId: "fb-123" },
    });
  });

  it("returns structured issues instead of throwing for malformed rows", () => {
    const out = parseBatchRow(` | unknown | not-a-date | Brief | ${"x".repeat(2_201)}`);
    expect(out.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "title_required",
        "format_invalid",
        "date_invalid",
        "caption_too_long",
      ]),
    );
  });

  it("preserves physical source line numbers across blank lines and CRLF", () => {
    const out = parseBatchRows(
      "\r\nFirst | story | 2026-09-05 09:00\r\n\r\nSecond | carousel | 2026-09-06 09:00",
    );
    expect(out.map((row) => row.lineNumber)).toEqual([2, 4]);
  });

  it("parses a spreadsheet header and per-row channel names", () => {
    const out = parseSpreadsheetRows(
      "Title\tFormat\tDate & time\tShort brief\tChannels\nSpring collection\tstatic_post\t2026-09-05 09:00\tPre-order\tInstagram, Facebook\nTutorial\tlong video\t2026-09-06 10:00\tChapters\tYouTube",
    );
    expect(out).toHaveLength(2);
    expect(out[0]?.channelNames).toEqual(["Instagram", "Facebook"]);
    expect(out[1]?.format).toBe("long_form_video");
    expect(out[0]?.lineNumber).toBe(2);
  });

  it("converts workspace-local time to UTC and back across Berlin DST", () => {
    const instant = parseBatchDateTime("2026-09-05 09:00", "Europe/Berlin");
    expect(instant?.toISOString()).toBe("2026-09-05T07:00:00.000Z");
    expect(formatBatchDateTimeForInput(instant!, "Europe/Berlin")).toBe("2026-09-05T09:00");
    expect(parseBatchDateTime("2026-03-29 02:30", "Europe/Berlin")).toBeNull();
  });

  it("accepts explicit ISO offsets for raw-import compatibility", () => {
    expect(parseBatchDateTime("2026-09-05T09:00:00+02:00", "UTC")?.toISOString()).toBe(
      "2026-09-05T07:00:00.000Z",
    );
  });
});
