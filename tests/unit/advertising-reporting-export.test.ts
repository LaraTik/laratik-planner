import { describe, expect, it } from "vitest";
import { rowsToXlsx } from "@/lib/exports/xlsx";
import { normalizeAdvertisingTag } from "@/lib/advertising/reporting-metadata";

describe("advertising reporting export foundation", () => {
  it("writes a readable store-only XLSX package with escaped multilingual cells", () => {
    const output = rowsToXlsx([
      ["Label", "Value"],
      ["العنوان & <test>", 12.5],
    ]);
    expect(output.subarray(0, 2).toString()).toBe("PK");
    const text = output.toString("utf8");
    expect(text).toContain("[Content_Types].xml");
    expect(text).toContain("xl/worksheets/sheet1.xml");
    expect(text).toContain("&lt;test&gt;");
    expect(text).toContain("العنوان");
  });

  it("normalizes internal taxonomy labels without changing provider values", () => {
    expect(normalizeAdvertisingTag("  Self   esteem  ")).toBe("Self esteem");
    expect(normalizeAdvertisingTag("  ")).toBe("");
  });
});
