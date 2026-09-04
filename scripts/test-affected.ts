import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import {
  classifyChangedFiles,
  globToRegExp,
  validateOwnershipManifest,
  type AffectedClassification,
  type BrowserSelection,
  type TestLayer,
  type TestOwnershipManifest,
} from "./test-affected-core";
import { TEST_OWNERSHIP } from "./test-ownership";

export type AffectedCliOptions = {
  since?: string;
  area?: string;
  layer: TestLayer | "all";
  coverage: boolean;
  staged: boolean;
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseAffectedArgs(args: string[]): AffectedCliOptions {
  const options: AffectedCliOptions = {
    layer: "all",
    coverage: false,
    staged: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument || argument === "--") continue;
    if (argument === "--coverage") {
      options.coverage = true;
      continue;
    }
    if (argument === "--staged") {
      options.staged = true;
      continue;
    }

    const [key, inlineValue] = argument.split("=", 2);
    if (key === "--since" || key === "--area" || key === "--layer") {
      const value = inlineValue ?? args[++index];
      if (!value) throw new Error(`${key} requires a value`);
      if (key === "--since") options.since = value;
      else if (key === "--area") options.area = value;
      else {
        if (value !== "unit" && value !== "integration" && value !== "browser" && value !== "all") {
          throw new Error("layer must be unit, integration, browser, or all");
        }
        options.layer = value;
      }
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  if (options.area && options.since) {
    throw new Error("--area and --since cannot be combined");
  }
  return options;
}

export function buildManualClassification(
  areaId: string,
  manifest: TestOwnershipManifest,
): AffectedClassification {
  const area = manifest.areas.find((candidate) => candidate.id === areaId);
  if (!area) {
    throw new Error(
      `Unknown test area '${areaId}'. Available areas: ${manifest.areas.map((candidate) => candidate.id).join(", ")}`,
    );
  }
  return {
    kind: "targeted",
    areaIds: [area.id],
    unitFiles: [...area.unitFiles],
    integrationFiles: [...area.integrationFiles],
    browser: area.browser.map((selection) => ({
      ...selection,
      ...(selection.projects ? { projects: [...selection.projects] } : {}),
    })),
    runAllUnit: false,
    runAllIntegration: false,
    runAllBrowser: false,
  };
}

function runGit(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function runGitOrNull(args: string[]): string | null {
  try {
    return runGit(args);
  } catch {
    return null;
  }
}

function changedFilesFromDiff(args: string[]): string[] {
  const output = execFileSync("git", ["diff", "--name-only", "-z", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean);
}

function collectChangedFiles(options: Pick<AffectedCliOptions, "since" | "staged">): string[] {
  if (options.staged) {
    return changedFilesFromDiff(["--cached"]);
  }

  const files = new Set<string>();
  const add = (values: string[]) => values.forEach((file) => files.add(file));

  if (options.since) {
    add(changedFilesFromDiff([`${options.since}...HEAD`]));
  } else {
    const upstream = runGitOrNull([
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ]);
    if (upstream) {
      add(changedFilesFromDiff([`${upstream}...HEAD`]));
    } else {
      const parent = runGitOrNull(["rev-parse", "HEAD^"]);
      add(parent ? changedFilesFromDiff([`${parent}...HEAD`]) : runGit(["ls-files"]).split("\n"));
    }
  }

  add(changedFilesFromDiff([]));
  add(changedFilesFromDiff(["--cached"]));
  add(runGit(["ls-files", "--others", "--exclude-standard"]).split("\n"));
  return [...files].filter(Boolean).sort();
}

function walkRepositoryFiles(directory: string, root = directory): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (
      entry.name === ".git" ||
      entry.name === ".codegraph" ||
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === "coverage" ||
      entry.name === "playwright-report" ||
      entry.name === "test-results"
    )
      continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkRepositoryFiles(fullPath, root));
    else if (entry.isFile() || entry.isSymbolicLink()) files.push(relative(root, fullPath));
  }
  return files;
}

function expandPatterns(patterns: string[], repositoryFiles: string[]): string[] {
  const result = new Set<string>();
  for (const file of repositoryFiles) {
    if (patterns.some((pattern) => globToRegExp(pattern).test(file))) result.add(file);
  }
  return [...result].sort();
}

function run(label: string, command: string, args: string[], env?: NodeJS.ProcessEnv): void {
  console.log(`\n▶ ${label}\n  ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
}

function selectedBrowserArgs(browser: BrowserSelection[]): string[] {
  const specs = [...new Set(browser.map((selection) => selection.spec))];
  const projects = [...new Set(browser.flatMap((selection) => selection.projects ?? ["chromium"]))];
  const greps = browser
    .map((selection) => selection.grep)
    .filter((grep): grep is string => Boolean(grep));
  const args = ["--", ...projects.flatMap((project) => ["--project", project]), ...specs];
  if (greps.length > 0) args.push("--grep", `(?:${greps.join(")|(?:")})`);
  return args;
}

function runUnit(
  classification: AffectedClassification,
  changedFiles: string[],
  options: AffectedCliOptions,
  repositoryFiles: string[],
): void {
  if (options.layer !== "all" && options.layer !== "unit") return;
  const sourceFiles = options.area
    ? []
    : changedFiles.filter((file) => file.startsWith("src/") && existsSync(join(ROOT, file)));
  const changedUnitFiles = changedFiles.filter((file) =>
    /^tests\/unit\/.*\.(test|spec)\.(ts|tsx)$/.test(file),
  );
  const directFiles = options.area
    ? expandPatterns(classification.unitFiles, repositoryFiles)
    : changedUnitFiles;
  const coverageArgs = options.coverage ? ["--coverage"] : [];

  if (classification.runAllUnit) {
    run("full unit suite", "pnpm", ["test:unit", ...coverageArgs]);
  } else if (sourceFiles.length > 0) {
    run("affected unit tests", "pnpm", [
      "exec",
      "vitest",
      "related",
      "--run",
      ...sourceFiles,
      ...coverageArgs,
    ]);
    if (directFiles.length > 0)
      run("changed unit tests", "pnpm", ["exec", "vitest", "run", ...directFiles, ...coverageArgs]);
  } else if (directFiles.length > 0) {
    run("changed unit tests", "pnpm", ["exec", "vitest", "run", ...directFiles, ...coverageArgs]);
  } else if (options.coverage) {
    throw new Error("--coverage was requested but no unit tests were selected");
  } else {
    console.log("\n⏭ unit: no affected unit tests");
  }
}

function runIntegration(
  classification: AffectedClassification,
  options: AffectedCliOptions,
  repositoryFiles: string[],
): void {
  if (options.layer !== "all" && options.layer !== "integration") return;
  if (classification.runAllIntegration) {
    run("full integration suite", "pnpm", ["test:integration"]);
    return;
  }
  const files = options.area
    ? expandPatterns(classification.integrationFiles, repositoryFiles)
    : classification.integrationFiles.filter((file) => existsSync(join(ROOT, file)));
  if (files.length === 0) {
    console.log("\n⏭ integration: no affected integration tests");
    return;
  }
  if (!process.env.TEST_DATABASE_URL || !/(test|ci)/i.test(process.env.TEST_DATABASE_URL)) {
    throw new Error(
      "Affected integration tests require TEST_DATABASE_URL containing 'test' or 'ci'. See docs/operations/runbook.md for setup.",
    );
  }
  run("affected integration tests", "pnpm", ["test:integration", "--", ...files]);
}

function runBrowser(classification: AffectedClassification, options: AffectedCliOptions): void {
  if (options.layer !== "all" && options.layer !== "browser") return;
  if (classification.runAllBrowser) {
    run("full browser matrix", "pnpm", ["test:e2e:isolated"]);
    return;
  }
  if (classification.browser.length === 0) {
    console.log("\n⏭ browser: no affected browser tests");
    return;
  }
  run("affected browser tests", "pnpm", [
    "test:e2e:isolated",
    ...selectedBrowserArgs(classification.browser),
  ]);
}

export function main(args = process.argv.slice(2)): void {
  const options = parseAffectedArgs(args);
  const repositoryFiles = walkRepositoryFiles(ROOT);
  const browserTestContents = Object.fromEntries(
    TEST_OWNERSHIP.areas
      .flatMap((area) => area.browser.map((selection) => selection.spec))
      .filter((spec, index, specs) => specs.indexOf(spec) === index)
      .filter((spec) => existsSync(join(ROOT, spec)))
      .map((spec) => [spec, readFileSync(join(ROOT, spec), "utf8")]),
  );
  const manifestErrors = validateOwnershipManifest(
    TEST_OWNERSHIP,
    repositoryFiles,
    browserTestContents,
  );
  if (manifestErrors.length > 0) {
    throw new Error(`Test ownership manifest is invalid:\n- ${manifestErrors.join("\n- ")}`);
  }
  const changedFiles = collectChangedFiles(options);
  const classification = options.area
    ? buildManualClassification(options.area, TEST_OWNERSHIP)
    : classifyChangedFiles(changedFiles, TEST_OWNERSHIP);

  console.log(`Affected files (${changedFiles.length}): ${changedFiles.join(", ") || "none"}`);
  if (classification.kind === "none") {
    console.log(`⏭ ${classification.reason}`);
    return;
  }
  if (classification.kind === "escalated") {
    console.log(`⚠ Escalated: ${classification.escalationReason}`);
  } else {
    console.log(`Areas: ${classification.areaIds.join(", ")}`);
  }

  runUnit(classification, changedFiles, options, repositoryFiles);
  runIntegration(classification, options, repositoryFiles);
  runBrowser(classification, options);
  console.log("\n✓ affected test selection passed");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
