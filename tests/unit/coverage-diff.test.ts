import { describe, expect, it } from "vitest";
import { buildCoverageDiffReport } from "../../scripts/coverage-diff";

describe("changed-line coverage", () => {
  it("counts only executable changed lines and reports uncovered lines", () => {
    const diff = [
      "diff --git a/src/lib/example.ts b/src/lib/example.ts",
      "index 0000000..1111111 100644",
      "--- a/src/lib/example.ts",
      "+++ b/src/lib/example.ts",
      "@@ -1,0 +2,3 @@",
      "+covered()",
      "+uncovered()",
      "+alsoCovered()",
      "",
    ].join("\n");
    const lcov = ["SF:src/lib/example.ts", "DA:2,1", "DA:3,0", "DA:4,2", "end_of_record", ""].join(
      "\n",
    );

    const report = buildCoverageDiffReport("base", "head", diff, lcov);
    expect(report).toMatchObject({
      base: "base",
      head: "head",
      changedLines: 3,
      coveredChangedLines: 2,
      coveragePercent: 66.67,
      files: [
        {
          file: "src/lib/example.ts",
          changedLines: 3,
          coveredChangedLines: 2,
          coveragePercent: 66.67,
          uncoveredLines: [3],
        },
      ],
    });
    expect(report.overallCoveragePercent).toBe(66.67);
    expect(report.trend.status).toBe("baseline-unavailable");
    expect(report.moduleTotals["src/lib"]?.coveragePercent).toBe(66.67);
  });

  it("does not treat changed non-executable lines as uncovered", () => {
    const diff = [
      "diff --git a/src/lib/example.ts b/src/lib/example.ts",
      "--- a/src/lib/example.ts",
      "+++ b/src/lib/example.ts",
      "@@ -1,0 +10,2 @@",
      "+type Example = string;",
      "+",
      "",
    ].join("\n");
    const lcov = ["SF:src/lib/example.ts", "end_of_record", ""].join("\n");

    expect(buildCoverageDiffReport("base", "head", diff, lcov)).toMatchObject({
      changedLines: 0,
      coveredChangedLines: 0,
      coveragePercent: null,
      trend: { status: "baseline-unavailable" },
      files: [],
    });
  });
});
