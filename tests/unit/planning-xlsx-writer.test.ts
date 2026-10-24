import { describe, expect, it } from "vitest";
import { workbookToXlsx } from "@/lib/exports/xlsx";

describe("planning XLSX writer", () => {
  it("preserves Arabic UTF-8 text and assigns right-to-left styles to Arabic sheets", () => {
    const workbook = workbookToXlsx([
      {
        name: "الجدول",
        rows: [
          ["العنوان", "موعد النشر"],
          ["إطلاق الحملة", 46200],
        ],
        headerRows: [0],
        dateColumns: [1],
        rightToLeft: true,
      },
    ]);
    const archive = workbook.toString("utf8");

    expect(archive).toContain("الجدول");
    expect(archive).toContain("إطلاق الحملة");
    expect(archive).toContain('rightToLeft="1"');
    expect(archive).toContain('<alignment horizontal="right" readingOrder="2"/>');
    expect(archive).toContain('<c r="A1" s="5"');
    expect(archive).toContain('<c r="A2" s="4"');
    expect(archive).toContain('<c r="B2" s="6" t="n">');
  });

  it("keeps the existing left-to-right cell styles for English workbooks", () => {
    const workbook = workbookToXlsx([
      { name: "Schedule", rows: [["Title"], ["Campaign"]], headerRows: [0] },
    ]);
    const archive = workbook.toString("utf8");

    expect(archive).toContain('<c r="A1" s="1"');
    expect(archive).toContain('<c r="A2" s="0"');
    expect(archive).not.toContain('rightToLeft="1"');
  });
});
