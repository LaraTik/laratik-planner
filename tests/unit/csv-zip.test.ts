import { describe, expect, it } from "vitest";
import { csvDisposition, rowsToCsv, type CsvColumn } from "@/lib/utils/csv";
import { buildZip } from "@/lib/utils/zip";

/**
 * FEAT-15 (GAP-FULL-REVIEW-2026-08-25) — unit tests for the
 * generic CSV serializer and the minimal ZIP writer. Both are
 * pure helpers; the export routes layer in the role gate + the
 * database query on top.
 */

interface Row {
  id: string;
  title: string;
  status: string;
  publishedAt: Date;
  brief: string;
}

const columns: CsvColumn<Row>[] = [
  { header: "id", get: (r) => r.id },
  { header: "title", get: (r) => r.title },
  { header: "status", get: (r) => r.status },
  { header: "published_at", get: (r) => r.publishedAt },
  { header: "brief", get: (r) => r.brief },
];

describe("rowsToCsv", () => {
  it("emits a header row followed by one row per input", () => {
    const csv = rowsToCsv<Row>(
      [
        {
          id: "1",
          title: "Hello",
          status: "draft",
          publishedAt: new Date("2026-08-30T10:00:00Z"),
          brief: "first",
        },
      ],
      columns,
    );
    const [header, row] = csv.split("\r\n");
    expect(header).toBe("id,title,status,published_at,brief");
    expect(row).toBe("1,Hello,draft,2026-08-30T10:00:00.000Z,first");
  });

  it("quotes fields containing comma, double-quote, or newline", () => {
    const csv = rowsToCsv<Row>(
      [
        {
          id: "1",
          title: `Hello, "world"\nNew line`,
          status: "draft",
          publishedAt: new Date("2026-08-30T10:00:00Z"),
          brief: "",
        },
      ],
      columns,
    );
    // The header is fine; the title field is quoted and the inner
    // double-quote is doubled.
    expect(csv).toContain('"Hello, ""world""\nNew line"');
  });

  it("serialises null / undefined as empty cells", () => {
    const csv = rowsToCsv<Row>(
      [
        {
          id: "1",
          title: "x",
          status: "draft",
          publishedAt: new Date("2026-08-30T10:00:00Z"),
          brief: "should appear",
        },
      ],
      [...columns, { header: "missing", get: () => null as unknown as string }],
    );
    const lines = csv.split("\r\n");
    expect(lines[1]?.endsWith(",should appear,")).toBe(true);
  });

  it("returns just the header (plus CRLF) for an empty row set", () => {
    const csv = rowsToCsv<Row>([], columns);
    expect(csv).toBe("id,title,status,published_at,brief\r\n");
  });
});

describe("csvDisposition", () => {
  it("strips path-traversal characters from the filename", () => {
    expect(csvDisposition("../../etc/passwd")).toContain("etc_passwd");
    expect(csvDisposition("normal-file.csv")).toContain('"normal-file.csv"');
  });
});

describe("buildZip", () => {
  it("produces a non-empty buffer with the EOCD signature at the end", () => {
    const buf = buildZip([{ name: "hello.txt", data: Buffer.from("hi", "utf8") }]);
    expect(buf.byteLength).toBeGreaterThan(20);
    // End of central directory record starts with 0x06054b50
    // (little-endian: 50 4b 05 06).
    expect(buf.readUInt32LE(buf.byteLength - 22)).toBe(0x06054b50);
  });

  it("round-trips a single text entry (uncompressed)", async () => {
    const buf = buildZip([{ name: "hello.txt", data: Buffer.from("Hello, world!", "utf8") }]);
    // Quick local-header check: first 4 bytes are the local file
    // header signature 0x04034b50.
    expect(buf.readUInt32LE(0)).toBe(0x04034b50);
    // The data should be at byte 30 + name length.
    const nameLen = buf.readUInt16LE(26);
    const dataStart = 30 + nameLen;
    const dataLen = buf.readUInt32LE(18);
    expect(buf.toString("utf8", dataStart, dataStart + dataLen)).toBe("Hello, world!");
  });

  it("rejects entry names that try to escape the archive root", () => {
    expect(() =>
      buildZip([{ name: "../etc/passwd", data: Buffer.from("x", "utf8") }]),
    ).toThrow(/invalid zip entry name/i);
    expect(() => buildZip([{ name: "/abs/path", data: Buffer.from("x", "utf8") }])).toThrow();
  });
});
