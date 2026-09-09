import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import type { AdvisoryReport } from "./advisory-report";

type Issue = { number: number; title: string; state: string; pull_request?: unknown };

function gh(args: string[]): string {
  const result = spawnSync("gh", ["api", ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "gh api failed");
  return result.stdout;
}

function findIssue(repo: string, title: string): Issue | undefined {
  const issues = JSON.parse(gh([`repos/${repo}/issues?state=all&per_page=100`])) as Issue[];
  return issues.find((issue) => issue.title === title && !issue.pull_request);
}

function issueBody(report: AdvisoryReport, title: string): string {
  const artifacts =
    report.artifacts.length > 0 ? report.artifacts.map((item) => `- ${item}`).join("\n") : "- None";
  return [
    `<!-- advisory-key:${title} -->`,
    `## ${title}`,
    "",
    `- **Status:** ${report.status}`,
    `- **SHA:** \`${report.sha}\``,
    `- **Attempts:** ${report.attempts}`,
    `- **Classification:** ${report.classification ?? "pending diagnosis"}`,
    `- **Next action:** ${report.nextAction}`,
    report.runUrl ? `- **Workflow:** ${report.runUrl}` : "",
    "",
    "### Artifacts",
    artifacts,
    "",
    "This issue is advisory. Diagnose and propose a fix; do not modify or deploy code automatically.",
  ]
    .filter(Boolean)
    .join("\n");
}

function main(): void {
  const reportPath = process.argv[2] ?? "advisory-result.json";
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as AdvisoryReport;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("GITHUB_REPOSITORY is required");
  const title = `Advisory: ${report.check} on main`;
  const existing = findIssue(repo, title);

  if (report.status === "failed" || report.status === "infrastructure") {
    const body = issueBody(report, title);
    if (existing) {
      if (existing.state !== "open") {
        gh([`repos/${repo}/issues/${existing.number}`, "--method", "PATCH", "-f", "state=open"]);
      }
      gh([`repos/${repo}/issues/${existing.number}`, "--method", "PATCH", "-f", `body=${body}`]);
      gh([
        `repos/${repo}/issues/${existing.number}/comments`,
        "--method",
        "POST",
        "-f",
        `body=Updated for ${report.sha}: ${report.nextAction}`,
      ]);
    } else {
      gh([
        `repos/${repo}/issues`,
        "--method",
        "POST",
        "-f",
        `title=${title}`,
        "-f",
        `body=${body}`,
      ]);
    }
    return;
  }

  if (existing?.state === "open") {
    gh([
      `repos/${repo}/issues/${existing.number}/comments`,
      "--method",
      "POST",
      "-f",
      `body=Recovered on ${report.sha}. Advisory check is ${report.status}.`,
    ]);
    gh([`repos/${repo}/issues/${existing.number}`, "--method", "PATCH", "-f", "state=closed"]);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
