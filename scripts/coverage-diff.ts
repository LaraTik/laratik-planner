import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type FileCoverage = {
  covered: Set<number>;
  executable: Set<number>;
};

export type CoverageDiffReport = {
  base: string;
  head: string;
  changedLines: number;
  coveredChangedLines: number;
  coveragePercent: number | null;
  overallCoveragePercent: number | null;
  trend: {
    status: "improved" | "regressed" | "unchanged" | "baseline-unavailable";
    previousPercent: number | null;
    currentPercent: number | null;
    delta: number | null;
  };
  moduleTotals: Record<
    string,
    { coveredLines: number; executableLines: number; coveragePercent: number | null }
  >;
  files: Array<{
    file: string;
    changedLines: number;
    coveredChangedLines: number;
    coveragePercent: number | null;
    uncoveredLines: number[];
  }>;
};

function argumentValue(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value ?? fallback;
}

function normalizeFile(file: string): string {
  const absolute = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  return path.relative(process.cwd(), absolute).replaceAll(path.sep, "/");
}

function isSourceFile(file: string): boolean {
  return /^src\/.*\.(?:ts|tsx)$/.test(file) && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file);
}

export function parseLcov(contents: string): Map<string, FileCoverage> {
  const result = new Map<string, FileCoverage>();
  let current: FileCoverage | undefined;
  let currentFile: string | undefined;

  for (const line of contents.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      currentFile = normalizeFile(line.slice(3));
      current = { covered: new Set(), executable: new Set() };
      result.set(currentFile, current);
      continue;
    }
    if (!current || !currentFile || !line.startsWith("DA:")) continue;
    const [lineNumberText, hitCountText] = line.slice(3).split(",", 2);
    const lineNumber = Number(lineNumberText);
    const hitCount = Number(hitCountText?.split(",", 1)[0]);
    if (!Number.isInteger(lineNumber) || lineNumber < 1 || !Number.isFinite(hitCount)) continue;
    current.executable.add(lineNumber);
    if (hitCount > 0) current.covered.add(lineNumber);
  }

  return result;
}

export function parseChangedLines(diff: string): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();
  let currentFile: string | undefined;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      currentFile = match?.[2] ? normalizeFile(match[2]) : undefined;
      if (currentFile && isSourceFile(currentFile)) result.set(currentFile, new Set());
      continue;
    }
    if (!currentFile || !isSourceFile(currentFile) || !line.startsWith("@@ ")) continue;
    const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    const start = Number(match?.[1]);
    const count = Number(match?.[2] ?? "1");
    const lines = result.get(currentFile);
    if (!lines || !Number.isInteger(start) || !Number.isInteger(count) || count < 1) continue;
    for (let lineNumber = start; lineNumber < start + count; lineNumber += 1) {
      lines.add(lineNumber);
    }
  }

  return result;
}

function findCoverage(coverage: Map<string, FileCoverage>, file: string): FileCoverage | undefined {
  const direct = coverage.get(file);
  if (direct) return direct;
  for (const [candidate, value] of coverage) {
    if (candidate.endsWith(`/${file}`)) return value;
  }
  return undefined;
}

export function buildCoverageDiffReport(
  base: string,
  head: string,
  diff: string,
  lcov: string,
  previous?: CoverageDiffReport,
): CoverageDiffReport {
  const coverage = parseLcov(lcov);
  const changed = parseChangedLines(diff);
  const files = [...changed.entries()]
    .filter(([, lines]) => lines.size > 0)
    .map(([file, lines]) => {
      const fileCoverage = findCoverage(coverage, file);
      const executable = fileCoverage?.executable ?? new Set<number>();
      const covered = fileCoverage?.covered ?? new Set<number>();
      const changedExecutable = [...lines].filter((line) => executable.has(line));
      const coveredChangedLines = changedExecutable.filter((line) => covered.has(line)).length;
      const uncoveredLines = changedExecutable.filter((line) => !covered.has(line));
      return {
        file,
        changedLines: changedExecutable.length,
        coveredChangedLines,
        coveragePercent:
          changedExecutable.length === 0
            ? null
            : Number(((coveredChangedLines / changedExecutable.length) * 100).toFixed(2)),
        uncoveredLines,
      };
    })
    .filter((file) => file.changedLines > 0);
  const changedLines = files.reduce((total, file) => total + file.changedLines, 0);
  const coveredChangedLines = files.reduce((total, file) => total + file.coveredChangedLines, 0);
  const moduleCounters = new Map<string, { coveredLines: number; executableLines: number }>();
  for (const [file, fileCoverage] of coverage) {
    const parts = file.split("/");
    const moduleName = parts.slice(0, -1).join("/") || parts[0] || "unknown";
    const current = moduleCounters.get(moduleName) ?? { coveredLines: 0, executableLines: 0 };
    current.coveredLines += fileCoverage.covered.size;
    current.executableLines += fileCoverage.executable.size;
    moduleCounters.set(moduleName, current);
  }
  const moduleTotals = Object.fromEntries(
    [...moduleCounters.entries()].map(([module, counts]) => [
      module,
      {
        ...counts,
        coveragePercent:
          counts.executableLines === 0
            ? null
            : Number(((counts.coveredLines / counts.executableLines) * 100).toFixed(2)),
      },
    ]),
  );
  const overallExecutableLines = [...coverage.values()].reduce(
    (total, file) => total + file.executable.size,
    0,
  );
  const overallCoveredLines = [...coverage.values()].reduce(
    (total, file) => total + file.covered.size,
    0,
  );
  const overallCoveragePercent =
    overallExecutableLines === 0
      ? null
      : Number(((overallCoveredLines / overallExecutableLines) * 100).toFixed(2));
  const previousPercent = previous?.overallCoveragePercent ?? null;
  const delta =
    previousPercent === null || overallCoveragePercent === null
      ? null
      : Number((overallCoveragePercent - previousPercent).toFixed(2));

  return {
    base,
    head,
    changedLines,
    coveredChangedLines,
    coveragePercent:
      changedLines === 0 ? null : Number(((coveredChangedLines / changedLines) * 100).toFixed(2)),
    overallCoveragePercent,
    trend: {
      status:
        delta === null
          ? "baseline-unavailable"
          : delta > 0
            ? "improved"
            : delta < 0
              ? "regressed"
              : "unchanged",
      previousPercent,
      currentPercent: overallCoveragePercent,
      delta,
    },
    moduleTotals,
    files,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const base = argumentValue(args, "--base", process.env.GITHUB_EVENT_BEFORE ?? "HEAD^1");
  const head = argumentValue(args, "--head", process.env.GITHUB_SHA ?? "HEAD");
  const lcovPath = argumentValue(args, "--lcov", "coverage/lcov.info");
  const outputPath = argumentValue(args, "--output", "coverage/advisory-diff.json");
  const previousPath = argumentValue(args, "--previous", "");
  const diff = execFileSync("git", ["diff", "--unified=0", `${base}...${head}`, "--", "src"], {
    encoding: "utf8",
  });
  const previous = previousPath
    ? (JSON.parse(readFileSync(previousPath, "utf8")) as CoverageDiffReport)
    : undefined;
  const report = buildCoverageDiffReport(
    base,
    head,
    diff,
    readFileSync(lcovPath, "utf8"),
    previous,
  );
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    report.coveragePercent === null
      ? `Changed executable lines: none (${report.files.length} changed source files)`
      : `Changed-line coverage: ${report.coveragePercent}% (${report.coveredChangedLines}/${report.changedLines})`,
  );
  for (const file of report.files.filter((candidate) => candidate.uncoveredLines.length > 0)) {
    console.log(`Uncovered changed lines: ${file.file}:${file.uncoveredLines.join(",")}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
