import { describe, expect, it } from "vitest";

import { BATCH_TEMPLATE_ROWS, buildBatchTemplateTsv } from "@/lib/content/batch-template";

describe("batch spreadsheet template", () => {
  it("covers every supported format with a realistic planning example", () => {
    expect(BATCH_TEMPLATE_ROWS).toHaveLength(8);
    expect(BATCH_TEMPLATE_ROWS.map((row) => row.format)).toEqual([
      "static_post",
      "carousel",
      "story",
      "short_form_video",
      "long_form_video",
      "live_content",
      "article",
      "other",
    ]);
  });

  it("explains the carousel slide sequence without pretending to fill creative fields", () => {
    const carousel = BATCH_TEMPLATE_ROWS.find((row) => row.format === "carousel");
    expect(carousel?.brief).toContain("5-slide carousel");
    expect(carousel?.brief).toContain("More details");
  });

  it("builds paste-ready TSV with the workspace's channel account names", () => {
    const tsv = buildBatchTemplateTsv(["Instagram Brand", "Facebook Brand"]);
    const lines = tsv.split("\n");
    expect(lines[0]).toBe("Title\tFormat\tDate & time\tShort brief\tChannels");
    expect(lines).toHaveLength(9);
    expect(lines[1]).toContain("static_post");
    expect(lines[2]).toContain("carousel");
    expect(lines[2]).toContain("Instagram Brand, Facebook Brand");
    expect(lines.every((line) => line.split("\t").length === 5)).toBe(true);
  });
});
