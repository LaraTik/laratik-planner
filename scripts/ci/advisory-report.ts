import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type Check = "coverage" | "e2e";
type Status = "passed" | "failed" | "flaky" | "infrastructure";
type Classification = "regression" | "intentional-change" | "test-defect" | "environment" | null;

export type AdvisoryReport = {
  check: Check;
  sha: string;
  status: Status;
  classification: Classification;
  attempts: number;
  artifacts: string[];
  nextAction: string;
  runUrl: string | null;
  durationSeconds: number | null;
  severity: "info" | "warning" | "critical";
};

function value(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  return (index >= 0 ? args[index + 1] : undefined) ?? fallback;
}

function nullableClassification(valueText: string): Classification {
  return valueText === "" || valueText === "null" ? null : (valueText as Classification);
}

function main(): void {
  const args = process.argv.slice(2);
  const check = value(args, "--check", "coverage") as Check;
  const status = value(args, "--status", "failed") as Status;
  const attempts = Number(value(args, "--attempts", "1"));
  const artifacts = value(args, "--artifacts", "")
    .split(",")
    .map((artifact) => artifact.trim())
    .filter(Boolean);
  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;
  const durationValue = Number(value(args, "--duration-seconds", ""));
  const durationSeconds = Number.isFinite(durationValue) ? durationValue : null;
  const severity = status === "passed" ? "info" : status === "flaky" ? "warning" : "critical";
  const report: AdvisoryReport = {
    check,
    sha: process.env.GITHUB_SHA ?? "local",
    status,
    classification: nullableClassification(value(args, "--classification", "null")),
    attempts: Number.isFinite(attempts) ? attempts : 1,
    artifacts,
    nextAction: value(
      args,
      "--next-action",
      status === "passed"
        ? "No action required."
        : "Review the failure artifacts and classify it as a regression, intentional change, test defect, or environment failure.",
    ),
    runUrl,
    durationSeconds,
    severity,
  };
  const output = value(args, "--output", `advisory-${check}.json`);
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const lines = [
      `## ${check === "coverage" ? "Coverage" : "E2E"} advisory`,
      "",
      `- **Status:** ${report.status}`,
      `- **Commit:** \`${report.sha}\``,
      `- **Attempts:** ${report.attempts}`,
      `- **Duration:** ${report.durationSeconds === null ? "unavailable" : `${report.durationSeconds}s`}`,
      `- **Severity:** ${report.severity}`,
      `- **Classification:** ${report.classification ?? "pending diagnosis"}`,
      `- **Next action:** ${report.nextAction}`,
      report.runUrl ? `- **Workflow:** [Open run](${report.runUrl})` : "",
      report.artifacts.length > 0 ? `- **Artifacts:** ${report.artifacts.join(", ")}` : "",
      "",
    ].filter(Boolean);
    appendFileSync(summaryPath, `${lines.join("\n")}\n`);
  }

  const diffReport = path.resolve("coverage/advisory-diff.json");
  if (check === "coverage" && report.status !== "passed" && !report.runUrl) {
    try {
      const diff = JSON.parse(readFileSync(diffReport, "utf8")) as { files?: unknown[] };
      console.log(`Coverage diff contains ${diff.files?.length ?? 0} changed source files.`);
    } catch {
      // The coverage command may fail before producing LCOV; the main report remains valid.
    }
  }
  console.log(JSON.stringify(report));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
