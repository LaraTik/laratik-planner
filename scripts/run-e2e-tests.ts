import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "TEST_DATABASE_URL is required and must point to a disposable PostgreSQL database.",
  );
  process.exit(1);
}
if (!/(test|ci)/i.test(databaseUrl)) {
  console.error("Refusing to run destructive browser tests against a URL without 'test' or 'ci'.");
  process.exit(1);
}

const requestedTests = process.argv.slice(2).filter((arg) => arg !== "--");
const testArgs = requestedTests.some((arg) => arg.startsWith("--workers"))
  ? requestedTests
  : [...requestedTests, "--workers=1"];
const port = process.env.PORT ?? "3011";
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;
const testOnlyAuthSecret = "laratik-e2e-auth-secret-not-for-production-2026";
const testOnlyAgencyCookieSecret = "laratik-e2e-agency-cookie-secret-not-for-production-2026";
const e2eUploadsDir = mkdtempSync(join(tmpdir(), "laratik-planner-e2e-uploads-"));
// Next's dev server may rewrite these tracked bootstrap files when it starts.
// Snapshot them so an isolated browser run never leaves generated framework
// edits mixed into the user's worktree, including when the caller already had
// intentional local changes.
const generatedFileSnapshots = ["tsconfig.json", "next-env.d.ts"].map((fileName) => ({
  fileName,
  contents: readFileSync(join(process.cwd(), fileName), "utf8"),
}));
const env: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  PORT: port,
  PLAYWRIGHT_BASE_URL: baseUrl,
  AUTH_URL: baseUrl,
  NEXTAUTH_URL: baseUrl,
  AUTH_TRUST_HOST: "true",
  // The runner has already refused any database URL that does not
  // contain test/ci. Supplying deterministic test-only secrets here
  // makes the isolated command reproducible without relying on a
  // developer's untracked .env file; production never executes this
  // script or inherits these values.
  AUTH_SECRET: process.env.AUTH_SECRET ?? testOnlyAuthSecret,
  AGENCY_COOKIE_SECRET: process.env.AGENCY_COOKIE_SECRET ?? testOnlyAgencyCookieSecret,
  // The readiness probe verifies the upload volume as well as Postgres.
  // Give isolated browser runs a disposable writable volume so the probe
  // exercises the real contract without touching /data/uploads.
  UPLOADS_DIR: process.env.UPLOADS_DIR ?? e2eUploadsDir,
};

let exitCode = 0;

try {
  for (const [command, args] of [
    ["pnpm", ["db:migrate"]],
    ["pnpm", ["exec", "playwright", "test", ...testArgs]],
  ] as const) {
    const result = spawnSync(command, args, { env, stdio: "inherit" });
    if (result.status !== 0) {
      exitCode = result.status ?? 1;
      break;
    }
  }
} finally {
  rmSync(e2eUploadsDir, { recursive: true, force: true });
  for (const { fileName, contents } of generatedFileSnapshots) {
    writeFileSync(join(process.cwd(), fileName), contents);
  }
}

if (exitCode !== 0) process.exit(exitCode);
