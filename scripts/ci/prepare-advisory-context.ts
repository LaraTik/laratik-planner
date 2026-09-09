import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

function argumentValue(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  return (index >= 0 ? args[index + 1] : undefined) ?? fallback;
}

function main(): void {
  const args = process.argv.slice(2);
  const check = argumentValue(args, "--check", "coverage");
  const base = argumentValue(args, "--base", "HEAD^1");
  const head = argumentValue(args, "--head", process.env.GITHUB_SHA ?? "HEAD");
  const output = argumentValue(args, "--output", "diagnosis-context");
  mkdirSync(output, { recursive: true });

  const diff = execFileSync("git", ["diff", "--binary", `${base}...${head}`, "--"], {
    encoding: "utf8",
  });
  writeFileSync(path.join(output, "diff.patch"), diff);

  for (const file of [".github/CODEOWNERS", "CODEOWNERS"]) {
    try {
      copyFileSync(file, path.join(output, path.basename(file)));
      break;
    } catch {
      // The repository may use only one of the supported CODEOWNERS locations.
    }
  }

  for (const file of readdirSync(".").filter((candidate) =>
    /^(coverage|e2e)-attempt-\d+\.log$|^advisory-(coverage|e2e)\.json$|^prior-advisory-issue\.txt$/.test(
      candidate,
    ),
  )) {
    copyFileSync(file, path.join(output, file));
  }

  for (const file of ["coverage/advisory-diff.json", "coverage/lcov.info"]) {
    try {
      copyFileSync(file, path.join(output, path.basename(file)));
    } catch {
      // Coverage files are absent when the runner fails before instrumentation.
    }
  }

  writeFileSync(
    path.join(output, "README.md"),
    `# Read-only advisory diagnosis context\n\n- Check: ${check}\n- Base SHA: ${base}\n- Head SHA: ${head}\n\nThis bundle is for diagnosis only. Read the diff, logs, artifacts, ownership manifest, and prior result. Propose a classification or fix, but do not modify code, push, merge, or deploy.\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
